import { timingSafeEqual } from "node:crypto";
import { createMiddleware } from "hono/factory";
import { config } from "../config/index.js";
import { UnauthorizedError } from "../lib/errors.js";
import type { AppEnv } from "../types/index.js";

const SERVICE_TOKEN_HEADER = "x-service-token";
const GYM_HEADER = "x-gym-id";
const WORKER_HEADER = "x-worker-id";

/** Constant-time, and length-safe: comparing different lengths throws. */
const matches = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  return left.length === right.length && timingSafeEqual(left, right);
};

/**
 * Trusts apps/app to call on behalf of an already-authenticated user.
 *
 * The web session is a next-auth cookie this API cannot verify — different
 * library, different secret — so the Next server acts as the front door: it
 * authenticates the user, then forwards the request with a shared token and the
 * caller's `gym_id`.
 *
 * The trade-off is explicit: anything holding SERVICE_TOKEN can name any gym.
 * That is acceptable while both processes are first-party and the API is not
 * publicly routable. Do not expose this API to the internet without moving to
 * per-user tokens (`requireAuth`), which bind the tenant into a signed claim
 * instead of a header.
 */
export const requireService = createMiddleware<AppEnv>(async (c, next) => {
  const expected = config.service.token;

  if (!expected) {
    // Not "forbidden" — the server is misconfigured, and saying so plainly
    // beats letting every request fail as a generic 401.
    throw new UnauthorizedError(
      "SERVICE_TOKEN is not configured on this server"
    );
  }

  const presented = c.req.header(SERVICE_TOKEN_HEADER);

  if (!(presented && matches(presented, expected))) {
    throw new UnauthorizedError("Invalid service token");
  }

  const gymId = c.req.header(GYM_HEADER);

  if (!gymId) {
    throw new UnauthorizedError(`Missing ${GYM_HEADER}`);
  }

  c.set("gymId", gymId);

  /*
   * Several ProFit tables declare `created_by` NOT NULL, so writes need to know
   * who the operator is. Not required here: every read-only route would break
   * for no benefit, and the write paths that need it fail loudly on their own.
   */
  c.set("workerId", c.req.header(WORKER_HEADER) ?? null);

  await next();
});
