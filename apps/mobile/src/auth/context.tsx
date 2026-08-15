import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  API_BASE,
  ApiError,
  apiFetch,
  apiPost,
  fetchWithTimeout,
  refreshSession,
  toApiError,
} from "../api/client";
import {
  getRefreshToken,
  onAccessTokenCleared,
  setAccessToken,
  setRefreshToken,
} from "../api/tokens";
import type { AuthUser, SessionResponse } from "../types";

/**
 * The session, and the boot sequence that restores it.
 *
 * Two rules carried over from the desk app, both of which were bugs first:
 *
 * 1. **Boot must not block.** Restoring happens behind `isRestoring` while the
 *    tree renders. The web version once awaited the session check before
 *    mounting React at all, and a hung request meant a permanently blank page
 *    with nothing in the log.
 * 2. **Only a rejection signs anyone out.** An unreachable API is `offline` and
 *    gets its own screen with a retry — not the sign-in form, which would need
 *    the same server that just failed.
 */

export type AuthStatus =
  | "restoring"
  | "authenticated"
  | "signed-out"
  | "offline";

interface AuthValue {
  /** Re-attempts the boot refresh — what the offline screen's button calls. */
  retry: () => void;
  signIn: (phone: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  status: AuthStatus;
  user: AuthUser | null;
}

const AuthContext = createContext<AuthValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<AuthStatus>("restoring");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [attempt, setAttempt] = useState(0);

  /*
   * `attempt` is not read inside the effect — it *is* the effect's trigger.
   * Bumping it is what the offline screen's retry button does, and dropping it
   * from the deps (as the rule suggests) would make that button do nothing.
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` re-runs the boot refresh
  useEffect(() => {
    let cancelled = false;

    setStatus("restoring");

    (async () => {
      const outcome = await refreshSession();

      if (cancelled) {
        return;
      }

      if (outcome === "offline") {
        setStatus("offline");

        return;
      }

      if (outcome === "rejected") {
        setUser(null);
        setStatus("signed-out");

        return;
      }

      /*
       * The refresh renewed the tokens but does not say who they belong to in a
       * shape this app keeps, so ask. A failure here is not a lost session —
       * the tokens are good — so it degrades to offline rather than signing out.
       */
      try {
        const me = await apiFetch<AuthUser>("/auth/me");

        if (!cancelled) {
          setUser(me);
          setStatus("authenticated");
        }
      } catch {
        if (!cancelled) {
          setStatus("offline");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  /*
   * A refresh that fails mid-session clears the access token from underneath
   * whatever screen is open. Without this the app would sit on a dashboard whose
   * every query 401s, which reads as "broken" rather than "signed out".
   */
  useEffect(
    () =>
      onAccessTokenCleared(() => {
        setUser(null);
        setStatus("signed-out");
      }),
    []
  );

  const signIn = useCallback(async (phone: string, password: string) => {
    /*
     * Deliberately not through `apiPost`: that retries a 401 through a refresh,
     * and a 401 here means "wrong password" — retrying it would spend the
     * previous user's refresh token and report the wrong failure.
     *
     * `mode` is left at its default (`token`), which is what puts the refresh
     * token in the body where SecureStore can take it.
     */
    const response = await fetchWithTimeout(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, phone }),
    }).catch(() => null);

    if (!response) {
      throw new ApiError(0, "offline", "offline");
    }

    if (!response.ok) {
      throw await toApiError(response);
    }

    const session = (await response.json()) as SessionResponse;

    setAccessToken(session.accessToken);
    await setRefreshToken(session.refreshToken);

    setUser(session.user);
    setStatus("authenticated");
  }, []);

  const signOut = useCallback(async () => {
    /*
     * Tell the backend first so the refresh token is denylisted rather than left
     * live until it expires — but do not let a failure strand anyone signed in
     * on a phone they are trying to sign out of. `/auth/logout` answers 204 to
     * anything, valid or garbage, so there is nothing to check.
     *
     * The token goes in the **body**: the desk app can leave this empty because
     * the browser attaches the refresh cookie, and there is no cookie here.
     */
    const refreshToken = await getRefreshToken();

    await apiPost("/auth/logout", {
      refreshToken: refreshToken ?? undefined,
    }).catch(() => undefined);

    setAccessToken(null);
    await setRefreshToken(null);

    setUser(null);
    setStatus("signed-out");
  }, []);

  const retry = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ retry, signIn, signOut, status, user }),
    [retry, signIn, signOut, status, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthValue => {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error("useAuth must be used inside an AuthProvider");
  }

  return value;
};
