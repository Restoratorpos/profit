import { type Session, sessionSchema } from "@/lib/auth/session";
import { getAccessToken, setAccessToken } from "@/lib/auth/tokens";

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
let refreshInFlight: Promise<Session | null> | null = null;

export const refreshSession = (): Promise<Session | null> => {
  refreshInFlight ??= (async () => {
    try {
      // Body is empty: the refresh token travels as the cookie.
      const response = await request("/auth/refresh", {
        method: "POST",
        body: "{}",
      });

      if (!response.ok) {
        setAccessToken(null);
        return null;
      }

      const session = sessionSchema.parse(await response.json());
      setAccessToken(session.accessToken);

      return session;
    } catch {
      setAccessToken(null);
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
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
  let response = await request(path, init);

  if (response.status === 401) {
    const session = await refreshSession();

    if (!session) {
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
