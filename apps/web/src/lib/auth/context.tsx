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
import { signIn as requestSignIn, signOut as requestSignOut } from "./api";
import type { AuthUser } from "./session";
import { onAccessTokenCleared } from "./tokens";

export interface AuthState {
  isAuthenticated: boolean;
  signIn: (phone: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  user: AuthUser | null;
}

const AuthContext = createContext<AuthState | null>(null);

interface AuthProviderProperties {
  children: ReactNode;
  /**
   * Resolved before render by main.tsx, so the first paint already knows
   * whether there is a session. Guessing and correcting would flash the
   * sign-in screen at every already-signed-in operator on every reload.
   */
  initialUser: AuthUser | null;
}

export const AuthProvider = ({
  children,
  initialUser,
}: AuthProviderProperties) => {
  const [user, setUser] = useState<AuthUser | null>(initialUser);

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
    () => ({ user, isAuthenticated: user !== null, signIn, signOut }),
    [user, signIn, signOut]
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
