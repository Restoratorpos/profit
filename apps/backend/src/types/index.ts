import type { Logger } from "pino";
import type { WORKER_ROLES, WORKER_STATUSES } from "../db/schema.js";

export type UserRole = (typeof WORKER_ROLES)[number];
export type WorkerStatus = (typeof WORKER_STATUSES)[number];

/**
 * The authenticated caller, as carried on a verified JWT.
 *
 * `gymId` is part of the identity, not a lookup: ProFit is multi-tenant and
 * every query is required to filter by it, so it has to travel with the caller
 * rather than being re-derived per request. `branchId` is nullable — gym-level
 * staff (an owner) are not tied to one location.
 */
export type AuthUser = {
  id: string;
  phone: string;
  name: string;
  role: UserRole;
  gymId: string;
  branchId: string | null;
};

/**
 * Hono's generic slot. Every c.get()/c.set() in the app is typed off this, so
 * anything a middleware hangs on the context belongs here.
 */
export type AppEnv = {
  Variables: {
    requestId: string;
    logger: Logger;
    user: AuthUser;
    /**
     * The tenant every query in the request filters by.
     *
     * Set by whichever middleware authenticated the caller — from a signed JWT
     * claim under `requireAuth`, or from the `x-gym-id` header under
     * `requireService`. Handlers deliberately cannot tell the difference, which
     * is what lets a route move between the two without touching its body.
     */
    gymId: string;
    /**
     * Who is performing the action, for the `created_by` columns. The token
     * subject under `requireAuth`; the `x-worker-id` header under
     * `requireService`, where it may be absent — only write paths care.
     */
    workerId: string | null;
  };
};
