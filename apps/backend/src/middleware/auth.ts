import { createMiddleware } from "hono/factory";
import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";
import { verifyAccessToken } from "../lib/jwt.js";
import type { AppEnv, UserRole } from "../types/index.js";

const BEARER_PREFIX = "Bearer ";

/** Rejects the request unless it carries a valid bearer token; sets c.get("user"). */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header("authorization");

  if (!header?.startsWith(BEARER_PREFIX)) {
    throw new UnauthorizedError("Missing bearer token");
  }

  const user = verifyAccessToken(header.slice(BEARER_PREFIX.length));

  if (!user) {
    throw new UnauthorizedError("Invalid or expired token");
  }

  c.set("user", user);

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
