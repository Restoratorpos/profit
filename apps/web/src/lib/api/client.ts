import { type Session, sessionSchema } from "@/lib/auth/session";
import {
  getAccessToken,
  setAccessToken,
  tokenGeneration,
} from "@/lib/auth/tokens";

/**
 * The transport every feature calls the API through.
 *
 * Separate from lib/auth because it is not an auth concern: features want
 * `apiFetch("/plans")`, not a dependency on how a session is established. What
 * lives here is the part that is the same for every request — the bearer token,
 * the refresh cookie, the timeout, and renewing an expired token once.
 */

/**
 * Same-origin on purpose. In development Vite proxies /api to the Hono server
 * on :7090; in production the SPA is served from the same origin as the API.
 * Either way the refresh cookie is first-party, so there is no CORS preflight
 * and no need for SameSite=None (which would require HTTPS the front desk does
 * not have).
 */
export const API_BASE = "/api";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string };
}

export const toApiError = async (response: Response): Promise<ApiError> => {
  const payload = (await response
    .json()
    .catch(() => null)) as ErrorEnvelope | null;

  return new ApiError(
    response.status,
    payload?.error?.code ?? "unknown",
    payload?.error?.message ?? `Request failed with ${response.status}`
  );
};

/**
 * Nothing the app waits on may hang indefinitely.
 *
 * A dev server proxying to a backend that is not listening will hold a request
 * open rather than refuse it, and the boot sequence waits on exactly such a
 * request. Ten seconds is far beyond a LAN round trip and far below a user's
 * patience for a blank screen.
 */
const REQUEST_TIMEOUT_MS = 10_000;

export const request = (
  path: string,
  init: RequestInit = {}
): Promise<Response> => {
  const token = getAccessToken();

  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
    // Sends the httpOnly refresh cookie. Without this the session cannot
    // survive a reload.
    credentials: "include",
    signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
};

/**
 * The in-flight refresh, if there is one.
 *
 * Single-flight is **required**, not an optimisation. The backend rotates
 * refresh tokens — each refresh revokes the token it was given — so two
 * concurrent refreshes would race: the first rotates, the second presents a
 * token that is now revoked, gets a 401, and signs the user out. Whenever
 * several requests 401 at once (which is the normal case, since a dashboard
 * fires many queries together) they must all wait on one refresh.
 */
let refreshInFlight: Promise<RefreshOutcome> | null = null;

/**
 * The two ways a refresh can fail, which are not the same thing.
 *
 * `rejected` is a verdict: the server read the cookie and said no — expired,
 * rotated away, or the account is gone. The session is genuinely over.
 *
 * `unavailable` is the absence of a verdict: the request never completed. A
 * timeout, a dropped connection, a 502 from the dev proxy, or the API restarting
 * mid-flight. Nothing was learned about the session, so nothing should be
 * concluded about it.
 */
type RefreshFailure = "rejected" | "unavailable";

/**
 * What a refresh attempt actually established, which is more than "did it work".
 *
 * The two failures are not interchangeable and the caller decides what to do
 * about each: a rejection is final and means signing out, while an unanswered
 * request means try again in a moment. Collapsing them to `null` is what turned
 * a restarting dev server into a sign-out — the boot path had no way to tell
 * "you have no session" from "I could not ask".
 */
export type RefreshOutcome =
  | { status: "ok"; session: Session }
  | { status: RefreshFailure };

/**
 * Whether a failed refresh means the session is over.
 *
 * Only the server actually rejecting the credential does. Treating every
 * failure as a rejection is what signed people out constantly in development:
 * `tsx watch` restarts the API on every save, so any request in flight at that
 * moment failed at the transport, cleared the token, and dropped the session —
 * with no bad credential anywhere in sight.
 */
const failureOf = (response: Response): RefreshFailure =>
  response.status === 401 || response.status === 403
    ? "rejected"
    : "unavailable";

/** Ends the session locally. Signed-out UI and an empty cache follow from this. */
const endSession = (failure: RefreshFailure): RefreshOutcome => {
  if (failure === "rejected") {
    setAccessToken(null);
  }

  return { status: failure };
};

/** The refresh, with the reason it failed intact. Single-flighted. */
export const attemptRefresh = (): Promise<RefreshOutcome> => {
  refreshInFlight ??= (async () => {
    try {
      // Body is empty: the refresh token travels as the cookie.
      const response = await request("/auth/refresh", {
        method: "POST",
        body: "{}",
      });

      if (!response.ok) {
        return endSession(failureOf(response));
      }

      const session = sessionSchema.parse(await response.json());
      setAccessToken(session.accessToken);

      return { status: "ok", session };
    } catch {
      /*
       * A throw here is a transport failure or an unreadable body — never a
       * verdict, because a verdict arrives as a status code. The caller's
       * request fails and the UI shows an error, but the session survives to be
       * retried on the next interaction.
       */
      return endSession("unavailable");
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
};

/** The same thing for callers that only need "did I end up with a session?". */
export const refreshSession = async (): Promise<Session | null> => {
  const outcome = await attemptRefresh();

  return outcome.status === "ok" ? outcome.session : null;
};

/**
 * Gets hold of a usable token after a 401, or reports that there is none.
 *
 * A 401 does not always mean the token expired — it also happens to a request
 * that was already in flight when someone else renewed it. That request is
 * simply stale, and refreshing on its behalf would spend a second refresh token
 * to learn what the app already knows. The generation captured before the
 * request tells the two apart.
 */
const renewedSince = async (generation: number): Promise<boolean> => {
  if (tokenGeneration() !== generation) {
    return getAccessToken() !== null;
  }

  return (await attemptRefresh()).status === "ok";
};

/**
 * Calls the API as the signed-in user, renewing the access token once if it has
 * expired.
 *
 * One retry only. If the request still 401s after a successful refresh, the
 * problem is authorisation rather than expiry, and retrying would loop.
 */
export const apiFetch = async <T>(
  path: string,
  init: RequestInit = {}
): Promise<T> => {
  const generation = tokenGeneration();
  let response = await request(path, init);

  if (response.status === 401) {
    if (!(await renewedSince(generation))) {
      throw await toApiError(response);
    }

    response = await request(path, init);
  }

  if (!response.ok) {
    throw await toApiError(response);
  }

  // 204 has no body; callers of DELETE/PATCH expect void.
  return response.status === 204
    ? (undefined as T)
    : ((await response.json()) as T);
};

/** Sugar so feature modules read as intent rather than as fetch options. */
export const apiPost = <T>(path: string, body: unknown): Promise<T> =>
  apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });

export const apiPatch = <T>(path: string, body: unknown): Promise<T> =>
  apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) });

/** Full replace, as opposed to PATCH's partial one. The backend distinguishes. */
export const apiPut = <T>(path: string, body: unknown): Promise<T> =>
  apiFetch<T>(path, { method: "PUT", body: JSON.stringify(body) });

export const apiDelete = <T = void>(path: string): Promise<T> =>
  apiFetch<T>(path, { method: "DELETE" });
