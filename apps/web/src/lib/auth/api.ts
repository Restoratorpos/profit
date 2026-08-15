import {
  API_BASE,
  attemptRefresh,
  request,
  toApiError,
} from "@/lib/api/client";
import { type Session, sessionSchema } from "./session";
import { setAccessToken } from "./tokens";

/**
 * Establishing and ending a session. The transport itself lives in
 * lib/api/client.ts, which every feature uses.
 */

/**
 * What the boot check concluded.
 *
 * `offline` is the one that has to exist separately: it is not a session and it
 * is not a signed-out visitor, it is "the question could not be asked". Treating
 * it as signed-out is what put operators back at the sign-in screen every time
 * the API blinked — and a sign-in form is useless in that state anyway, since
 * signing in needs the same server that just failed to answer.
 */
export type RestoreOutcome =
  | { status: "session"; session: Session }
  | { status: "signed-out" }
  | { status: "offline" };

/**
 * How long to wait before asking again, per attempt.
 *
 * Short, because the whole app is waiting on this: two extra tries covers a dev
 * server mid-restart or a packet lost on the desk's Wi-Fi, and anything longer
 * than that is a real outage the operator should be told about rather than
 * spun at.
 */
const RETRY_DELAYS_MS = [300, 1000];

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Asked at boot: is there still a session behind the httpOnly refresh cookie?
 *
 * A rejection is taken at face value — the cookie is gone, expired, or the
 * account was closed, and there is nothing to retry. Anything else is retried,
 * because this single request is the *only* thing deciding whether a reload
 * lands the operator back in the app or at the sign-in screen, and one dropped
 * packet should not be able to decide it.
 */
export const restoreSession = async (): Promise<RestoreOutcome> => {
  for (let attempt = 0; ; attempt++) {
    const outcome = await attemptRefresh();

    if (outcome.status === "ok") {
      return { status: "session", session: outcome.session };
    }

    if (outcome.status === "rejected") {
      return { status: "signed-out" };
    }

    if (attempt >= RETRY_DELAYS_MS.length) {
      return { status: "offline" };
    }

    await wait(RETRY_DELAYS_MS[attempt] ?? 0);
  }
};

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
