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
