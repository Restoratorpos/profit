import { type Session, sessionSchema } from "./session";
import { getAccessToken, setAccessToken } from "./tokens";

/**
 * Same-origin on purpose. In development Vite proxies /api to the Hono server
 * on :7090; in production the SPA is served from the same origin as the API.
 * Either way the refresh cookie is first-party, so there is no CORS preflight
 * and no need for SameSite=None (which would require HTTPS the front desk does
 * not have).
 */
const API_BASE = "/api";

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

const toApiError = async (response: Response): Promise<ApiError> => {
  const payload = (await response
    .json()
    .catch(() => null)) as ErrorEnvelope | null;

  return new ApiError(
    response.status,
    payload?.error?.code ?? "unknown",
    payload?.error?.message ?? `Request failed with ${response.status}`
  );
};

const request = (path: string, init: RequestInit = {}): Promise<Response> => {
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

const refreshSession = (): Promise<Session | null> => {
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

/** Exposed for the boot sequence, which asks "is there a session?" before rendering. */
export const restoreSession = (): Promise<Session | null> => refreshSession();

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

export const signIn = async (
  phone: string,
  password: string
): Promise<Session> => {
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
