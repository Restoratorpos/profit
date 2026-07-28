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
    /** Set by requireService. The tenant every query in the request filters by. */
    gymId: string;
    /**
     * Set by requireService from the calling app's session. Null when the
     * caller did not name one, which only write paths care about.
     */
    workerId: string | null;
  };
};
