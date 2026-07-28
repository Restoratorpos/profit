import {
  API_BASE,
  refreshSession,
  request,
  toApiError,
} from "@/lib/api/client";
import { type Session, sessionSchema } from "./session";
import { setAccessToken } from "./tokens";

/**
 * Establishing and ending a session. The transport itself lives in
 * lib/api/client.ts, which every feature uses.
 */

/** Asked at boot: is there still a session behind the httpOnly refresh cookie? */
export const restoreSession = (): Promise<Session | null> => refreshSession();

export const signIn = async (
  phone: string,
  password: string
): Promise<Session> => {
  /*
   * Deliberately not `request()`: that attaches the current bearer token, and
   * signing in is the one call that must not be made as whoever was signed in
   * before.
   */
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // "cookie" is what makes the backend keep the refresh token out of this
    // response and set it as an httpOnly cookie instead.
    body: JSON.stringify({ phone, password, mode: "cookie" }),
    credentials: "include",
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  const session = sessionSchema.parse(await response.json());
  setAccessToken(session.accessToken);

  return session;
};

export interface RegisterInput {
  name: string;
  password: string;
  phone: string;
}

/**
 * Creates the account and lands signed in, in one call.
 *
 * The Next version needed two: `POST /api/register` through a same-origin proxy
 * (the backend URL was server-only), and then a separate next-auth `signIn`
 * with the same credentials — because Auth.js owned the session and
 * deliberately discarded the token the backend already returned. That had a
 * genuinely bad failure mode in the middle: an account created but the sign-in
 * rejected left the user reading "Account created. Please sign in."
 *
 * Here the backend's own session is the session, so `mode: "cookie"` makes
 * registration and sign-in the same round trip and that gap cannot exist.
 *
 * Registration onboards a *tenant*, not a person: the backend creates a gym, a
 * branch and an `owner` worker in one transaction.
 */
export const register = async ({
  name,
  password,
  phone,
}: RegisterInput): Promise<Session> => {
  // Not `request()`: signing up must not be attributed to whoever was signed in
  // before, and there is no session to attach anyway.
  const response = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, password, phone, mode: "cookie" }),
    credentials: "include",
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  const session = sessionSchema.parse(await response.json());
  setAccessToken(session.accessToken);

  return session;
};

export const signOut = async (): Promise<void> => {
  try {
    // Best effort: the server revokes the refresh token and expires the cookie.
    await request("/auth/logout", { method: "POST", body: "{}" });
  } finally {
    // Local state is dropped either way — a user who asked to sign out must end
    // up signed out even if the network call failed.
    setAccessToken(null);
  }
};
