import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { purgeCache } from "@/lib/query-client";
import {
  signIn as requestSignIn,
  signOut as requestSignOut,
  restoreSession,
} from "./api";
import type { AuthUser } from "./session";
import { onAccessTokenCleared } from "./tokens";

export interface AuthState {
  isAuthenticated: boolean;
  /** True until the boot session check has answered. Guards must not run yet. */
  isRestoring: boolean;
  signIn: (phone: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  user: AuthUser | null;
}

const AuthContext = createContext<AuthState | null>(null);

interface AuthProviderProperties {
  children: ReactNode;
  /**
   * Only for tests, which supply a session directly rather than restoring one.
   * Passing a user skips the boot check entirely.
   */
  initialUser?: AuthUser | null;
  /** Tests opt out of the network call by passing false. */
  restoreOnMount?: boolean;
}

export const AuthProvider = ({
  children,
  initialUser = null,
  restoreOnMount = true,
}: AuthProviderProperties) => {
  const [user, setUser] = useState<AuthUser | null>(initialUser);
  const [isRestoring, setIsRestoring] = useState(restoreOnMount);

  /*
   * The session is restored here rather than with a top-level await in main.tsx.
   *
   * That await ran before createRoot().render(), so a request that hung — a dev
   * proxy pointing at a backend that is not listening will hold one open rather
   * than refuse it — meant React never mounted at all: a permanently blank page,
   * no error, nothing to debug. Restoring inside React means the shell always
   * paints and a stuck backend shows as a loading state that eventually resolves
   * to the sign-in screen.
   */
  useEffect(() => {
    if (!restoreOnMount) {
      return;
    }

    let cancelled = false;

    restoreSession()
      .then((session) => {
        if (!cancelled) {
          setUser(session?.user ?? null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsRestoring(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [restoreOnMount]);

  /*
   * A refresh can fail long after boot — the token expired, the account was
   * deactivated, Redis revoked it. The api layer clears the access token when
   * that happens; this turns it into signed-out UI rather than a screen of
   * failed requests.
   */
  useEffect(
    () =>
      onAccessTokenCleared(() => {
        setUser(null);
        purgeCache();
      }),
    []
  );

  const signIn = useCallback(async (phone: string, password: string) => {
    const session = await requestSignIn(phone, password);

    // Purge before adopting the new user: on a shared terminal the cache may
    // still hold the previous operator's gym.
    purgeCache();
    setUser(session.user);
  }, []);

  const signOut = useCallback(async () => {
    await requestSignOut();
    setUser(null);
    purgeCache();
  }, []);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: user !== null,
      isRestoring,
      signIn,
      signOut,
    }),
    [user, isRestoring, signIn, signOut]
  );

  return <AuthContext value={value}>{children}</AuthContext>;
};

export const useAuth = (): AuthState => {
  const value = use(AuthContext);

  if (!value) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }

  return value;
};
