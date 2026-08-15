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

type ServiceCaller = {
  gymId: string;
  workerId: string | null;
};

/** Reads a header by name, case-insensitively — `c.req.header` satisfies this. */
type HeaderReader = (name: string) => string | undefined;

/**
 * Validates the shared-token handshake and returns who the caller claims to be.
 *
 * Split out from the middleware so `requireCaller` can reuse it during the
 * migration without nesting one Hono middleware inside another.
 */
export const authenticateService = (header: HeaderReader): ServiceCaller => {
  const expected = config.service.token;

  if (!expected) {
    // Not "forbidden" — the server is misconfigured, and saying so plainly
    // beats letting every request fail as a generic 401.
    throw new UnauthorizedError(
      "SERVICE_TOKEN is not configured on this server"
    );
  }

  const presented = header(SERVICE_TOKEN_HEADER);

  if (!(presented && matches(presented, expected))) {
    throw new UnauthorizedError("Invalid service token");
  }

  const gymId = header(GYM_HEADER);

  if (!gymId) {
    throw new UnauthorizedError(`Missing ${GYM_HEADER}`);
  }

  /*
   * Several ProFit tables declare `created_by` NOT NULL, so writes need to know
   * who the operator is. Not required here: every read-only route would break
   * for no benefit, and the write paths that need it fail loudly on their own.
   */
  return { gymId, workerId: header(WORKER_HEADER) ?? null };
};

/**
 * Trusted apps/app to call on behalf of an already-authenticated user.
 *
 * **Obsolete: apps/app was deleted on 2026-07-29 and no caller remains.** This
 * whole file should go — see `middleware/caller.ts` for what that takes.
 *
 * It worked because the web session was a next-auth cookie this API could not
 * verify — different library, different secret — so the Next server acted as
 * the front door: it authenticated the user, then forwarded the request with a
 * shared token and the caller's `gym_id`.
 *
 * The trade-off was explicit: anything holding SERVICE_TOKEN can name any gym.
 * That was acceptable while the only holder was a first-party server on a
 * non-public API. With that server gone the trade-off buys nothing and the
 * exposure stands.
 *
 * **Being retired.** Routes now mount `requireCaller`, which prefers a per-user
 * bearer token and only falls back to this. Once apps/app is gone (Phase 5 of
 * MIGRATION-VITE.md) this middleware and SERVICE_TOKEN go with it.
 */
export const requireService = createMiddleware<AppEnv>(async (c, next) => {
  const { gymId, workerId } = authenticateService(c.req.header.bind(c.req));

  c.set("gymId", gymId);
  c.set("workerId", workerId);

  await next();
});
