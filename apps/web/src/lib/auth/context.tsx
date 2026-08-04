import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { purgeCache } from "@/lib/query-client";
import {
  type RegisterInput,
  register as requestRegister,
  signIn as requestSignIn,
  signOut as requestSignOut,
  restoreSession,
} from "./api";
import type { AuthUser } from "./session";
import { onAccessTokenCleared } from "./tokens";

export interface AuthState {
  isAuthenticated: boolean;
  /**
   * The boot check could not reach the API, so whether there is a session is
   * still unknown. Distinct from signed-out: nothing has been ruled out, and
   * routing on it would bounce a signed-in operator to the sign-in screen over
   * a dropped packet.
   */
  isOffline: boolean;
  /** True until the boot session check has answered. Guards must not run yet. */
  isRestoring: boolean;
  /** Asks again after an `isOffline` boot. */
  retryRestore: () => void;
  signIn: (phone: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Onboards a whole tenant — gym, branch and owner — and signs them in. */
  signUp: (input: RegisterInput) => Promise<void>;
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
  const [isOffline, setIsOffline] = useState(false);

  /**
   * Which restore is the current one.
   *
   * Bumping it abandons whatever is in flight, which is what both unmounting and
   * retrying need — and StrictMode's double mount means a discarded first
   * attempt is the ordinary case in development, not an edge one.
   */
  const attemptRef = useRef(0);

  /**
   * Nothing awaits this, so it must not be able to reject.
   *
   * `restoreSession` reports failure by returning rather than throwing, and the
   * only thing left that can raise is a state update landing after this tree is
   * gone. An unhandled rejection from the boot path is worth ruling out on its
   * own: it surfaces nowhere useful and takes a test worker down with it.
   */
  const restore = useCallback(async (): Promise<void> => {
    attemptRef.current += 1;
    const attempt = attemptRef.current;

    try {
      setIsRestoring(true);
      setIsOffline(false);

      const outcome = await restoreSession();

      if (attemptRef.current !== attempt) {
        return;
      }

      // Only a verdict moves the user. An unreachable API leaves whoever was
      // signed in exactly where they were and says so, rather than quietly
      // demoting them to signed-out.
      if (outcome.status === "session") {
        setUser(outcome.session.user);
      } else if (outcome.status === "signed-out") {
        setUser(null);
      }

      setIsOffline(outcome.status === "offline");
      setIsRestoring(false);
    } catch {
      // Only reachable once this provider is unmounted, in which case there is
      // nothing left to tell.
    }
  }, []);

  /*
   * The session is restored here rather than with a top-level await in main.tsx.
   *
   * That await ran before createRoot().render(), so a request that hung — a dev
   * proxy pointing at a backend that is not listening will hold one open rather
   * than refuse it — meant React never mounted at all: a permanently blank page,
   * no error, nothing to debug. Restoring inside React means the shell always
   * paints and a stuck backend shows as a loading state that eventually resolves.
   */
  useEffect(() => {
    if (!restoreOnMount) {
      return;
    }

    restore();

    return () => {
      // Abandons the in-flight attempt rather than letting it set state after
      // this provider is gone.
      attemptRef.current += 1;
    };
  }, [restoreOnMount, restore]);

  const retryRestore = useCallback(() => {
    restore();
  }, [restore]);

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

  const signUp = useCallback(async (input: RegisterInput) => {
    const session = await requestRegister(input);

    // A brand-new tenant has nothing cached, but the terminal may still hold
    // the previous operator's gym.
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
      isOffline,
      isRestoring,
      retryRestore,
      signIn,
      signOut,
      signUp,
    }),
    [user, isOffline, isRestoring, retryRestore, signIn, signOut, signUp]
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
