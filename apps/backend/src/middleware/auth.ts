import { createMiddleware } from "hono/factory";
import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";
import { verifyAccessToken } from "../lib/jwt.js";
import type { AppEnv, AuthUser, UserRole } from "../types/index.js";

const BEARER_PREFIX = "Bearer ";

/**
 * Reads a bearer token off the request, or null when there is no Authorization
 * header at all.
 *
 * The distinction between "absent" and "invalid" is the useful part: a
 * malformed or expired token is a *failed* attempt to authenticate and throws,
 * while no header at all is merely anonymous and lets the caller decide what
 * that means. `requireCaller` depends on this to refuse falling back to the
 * service token when a browser presents a stale session.
 */
export const authenticateBearer = (
  header: string | undefined
): AuthUser | null => {
  if (!header) {
    return null;
  }

  if (!header.startsWith(BEARER_PREFIX)) {
    throw new UnauthorizedError("Malformed Authorization header");
  }

  const user = verifyAccessToken(header.slice(BEARER_PREFIX.length));

  if (!user) {
    throw new UnauthorizedError("Invalid or expired token");
  }

  return user;
};

/**
 * Puts the caller on the context, along with the tenant and operator every
 * downstream query needs.
 *
 * `gymId` and `workerId` are set here from the *signed claims* — the same two
 * slots `requireService` fills from request headers. That symmetry is the point:
 * handlers read `c.get("gymId")` and cannot tell which front door a request came
 * through, so moving a route between the two is a line of middleware and nothing
 * else.
 *
 * Note what is deliberately absent: `x-gym-id` is never consulted here. Under a
 * bearer token the tenant is a claim this server signed, so a caller cannot name
 * a gym that is not theirs — exactly the property `requireService` cannot offer.
 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const user = authenticateBearer(c.req.header("authorization"));

  if (!user) {
    throw new UnauthorizedError("Missing bearer token");
  }

  c.set("user", user);
  c.set("gymId", user.gymId);
  c.set("workerId", user.id);

  await next();
});

/** Use after requireAuth: `.get("/admin", requireAuth, requireRole("admin"), handler)`. */
export const requireRole = (...roles: UserRole[]) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get("user");

    if (!roles.includes(user.role)) {
      throw new ForbiddenError("You do not have access to this resource");
    }

    await next();
  });
