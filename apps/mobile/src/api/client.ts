import Constants from "expo-constants";
import type { SessionResponse } from "../types";
import {
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
  tokenGeneration,
} from "./tokens";

/**
 * The transport every screen calls the API through.
 *
 * Mirrors `apps/web/src/lib/api/client.ts` — same single-flight refresh, same
 * generation check, same error envelope — with one structural difference: the
 * web app is same-origin behind a Vite proxy and can say `/api`, while a phone
 * has to name an absolute host. That host is build-time configuration.
 */

/**
 * `EXPO_PUBLIC_` is inlined by Metro at build time, so an EAS profile can point
 * a preview build at staging without touching code (see `eas.json`). The
 * `app.json` value is the fallback the simulator uses.
 *
 * On a **physical Android phone** `localhost` is the phone itself — set this to
 * the development machine's LAN address (`http://192.168.x.x:7090`) or nothing
 * will connect.
 */
export const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ??
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  "http://localhost:7090";

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

/** Every backend error serializes as `{ error: { code, message } }`. */
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
 * A phone on gym wifi that has drifted out of range does not get a refused
 * connection — it gets a socket that stays open until the OS gives up, which is
 * far longer than anyone will hold a phone up waiting.
 */
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * `fetch` with a deadline — and the reason this is hand-rolled.
 *
 * **`AbortSignal.timeout` does not exist in React Native.** RN polyfills the
 * global from the `abort-controller` package (`Libraries/Core/setUpXHR.js`),
 * which implements the instance API and none of the statics. TypeScript sees
 * the DOM lib and typechecks it happily; the device throws
 * `TypeError: AbortSignal.timeout is not a function`.
 *
 * That threw while *assembling the argument to `fetch`*, before any promise
 * existed — so a `.catch()` on the fetch could not see it, and sign-in reported
 * "wrong phone or password" for a request that had never left the phone. Which
 * is why this is a function rather than an inline signal: everything that talks
 * to the API goes through one place that cannot regress to the static again.
 */
export const fetchWithTimeout = async (
  url: string,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<Response> => {
  // A caller-supplied signal owns the lifetime; do not layer a second one on it.
  if (init.signal) {
    return await fetch(url, init);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const request = (path: string, init: RequestInit = {}): Promise<Response> => {
  const token = getAccessToken();

  return fetchWithTimeout(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
};

/**
 * What a refresh attempt concluded.
 *
 * Three answers, not two — and the third is the whole point. `rejected` means
 * the server looked at the token and said no; that is the only outcome allowed
 * to sign anyone out. `offline` means the API could not be reached at all, which
 * is **not** evidence about the session: throwing the manager back to a sign-in
 * form would ask them to authenticate against the same server that just failed
 * to answer. The desk app learned this the hard way — see the boot notes in
 * `.claude/CLAUDE.md`.
 */
export type RefreshOutcome = "session" | "rejected" | "offline";

/*
 * The in-flight refresh, if there is one.
 *
 * Single-flight on purpose: five screens' queries resuming together behind an
 * expired token would otherwise fire five refreshes, and because refresh tokens
 * rotate, four of them race to spend a token the fifth already replaced. The
 * backend's rotation grace covers a lost response, not a self-inflicted stampede.
 */
let inFlight: Promise<RefreshOutcome> | null = null;

/** Trades the stored refresh token for a new pair. */
export const refreshSession = (): Promise<RefreshOutcome> => {
  inFlight ??= (async () => {
    try {
      const refreshToken = await getRefreshToken();

      // Never signed in on this device. A verdict, not a network problem.
      if (!refreshToken) {
        return "rejected";
      }

      const response = await fetchWithTimeout(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });

      if (response.status === 401) {
        // Spent, revoked or forged. The session is genuinely over.
        setAccessToken(null);
        await setRefreshToken(null);

        return "rejected";
      }

      if (!response.ok) {
        /*
         * 500, 502, 503 — the server having a bad moment. The stored token is
         * still good, so keep it and let the next attempt try again.
         */
        return "offline";
      }

      const session = (await response.json()) as SessionResponse;

      setAccessToken(session.accessToken);
      await setRefreshToken(session.refreshToken);

      return "session";
    } catch {
      // Timed out or unreachable. Same reasoning: do not discard the token.
      return "offline";
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
};

/**
 * One request, retried once through a refresh if the token had expired.
 *
 * The generation check is what stops a thundering herd: if the token was already
 * replaced while this request was in the air, the 401 was answered by somebody
 * else's refresh and this call just needs replaying.
 */
const send = async (path: string, init: RequestInit): Promise<Response> => {
  const generation = tokenGeneration();
  const response = await request(path, init);

  if (response.status !== 401) {
    return response;
  }

  const renewed =
    tokenGeneration() !== generation
      ? true
      : (await refreshSession()) === "session";

  if (!renewed) {
    return response;
  }

  return request(path, init);
};

const parse = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    throw await toApiError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
};

export const apiFetch = async <T>(
  path: string,
  init: RequestInit = {}
): Promise<T> => parse<T>(await send(path, init));

export const apiPost = async <T>(path: string, body?: unknown): Promise<T> =>
  parse<T>(
    await send(path, {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );

export const apiPatch = async <T>(path: string, body?: unknown): Promise<T> =>
  parse<T>(
    await send(path, {
      method: "PATCH",
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );

/** `?a=1&b=2`, skipping anything absent. Empty when nothing survives. */
export const queryString = (
  params: Record<string, string | number | null | undefined>
): string => {
  const parts: string[] = [];

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") {
      continue;
    }

    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  }

  return parts.length > 0 ? `?${parts.join("&")}` : "";
};
