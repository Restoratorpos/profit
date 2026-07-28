import "server-only";
import { keys } from "@repo/auth/keys";
import { currentUser } from "@repo/auth/server";

/**
 * Calls apps/backend on behalf of the signed-in user.
 *
 * This is the only place the app talks to the API, and it is server-only on
 * purpose: the service token must never reach the browser. The tenant is read
 * from the session here rather than accepted from the caller, so no page can
 * ask for another gym's data by passing a different id.
 */

export class BackendError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "BackendError";
    this.status = status;
  }
}

interface BackendRequest {
  body?: unknown;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
}

export const backendFetch = async <T>(
  path: string,
  { method = "GET", body }: BackendRequest = {}
): Promise<T> => {
  const { AUTH_BACKEND_URL, SERVICE_TOKEN } = keys();

  if (!AUTH_BACKEND_URL) {
    throw new Error("AUTH_BACKEND_URL is not set.");
  }

  if (!SERVICE_TOKEN) {
    throw new Error(
      "SERVICE_TOKEN is not set — add it to apps/app/.env.local and apps/backend/.env.local (same value)."
    );
  }

  const user = await currentUser();

  if (!user?.gymId) {
    throw new BackendError(401, "Not signed in");
  }

  const response = await fetch(new URL(path, AUTH_BACKEND_URL).toString(), {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-service-token": SERVICE_TOKEN,
      "x-gym-id": user.gymId,
      /*
       * Who is doing this, for the `created_by` columns ProFit requires. Read
       * from the session for the same reason the tenant is: the caller must not
       * be able to attribute a payment to somebody else.
       */
      "x-worker-id": user.id,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;

    throw new BackendError(
      response.status,
      payload?.error?.message ?? `Backend returned ${response.status}`
    );
  }

  // 204 has no body; callers of DELETE/PATCH expect void.
  return response.status === 204
    ? (undefined as T)
    : ((await response.json()) as T);
};
