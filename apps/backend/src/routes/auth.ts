import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { loginRateLimit } from "../middleware/login-rate-limit.js";
import {
  credentialsSchema,
  refreshSchema,
  registerSchema,
} from "../schemas/auth.js";
import {
  login,
  logout,
  refreshSession,
  register,
  verifyCredentials,
} from "../services/auth.service.js";
import type { AppEnv } from "../types/index.js";

export const authRoutes = new Hono<AppEnv>()
  .post("/register", zValidator("json", registerSchema), async (c) => {
    const session = await register(c.req.valid("json"));

    return c.json(session, 201);
  })
  /**
   * The throttle sits after validation on purpose: it keys on the *normalised*
   * phone, so every spelling of the same number shares one counter.
   */
  .post(
    "/login",
    zValidator("json", credentialsSchema),
    loginRateLimit,
    async (c) => {
      const { phone, password } = c.req.valid("json");

      return c.json(await login(phone, password));
    }
  )
  .post("/refresh", zValidator("json", refreshSchema), async (c) => {
    const { refreshToken } = c.req.valid("json");

    return c.json(await refreshSession(refreshToken));
  })
  /**
   * Revokes a refresh token. Always 204, even for a token that was already
   * invalid — see the service for why this must not be an oracle.
   *
   * Takes no bearer token: signing out has to work when the access token has
   * already expired, which is exactly when a user is most likely to try.
   */
  .post("/logout", zValidator("json", refreshSchema), async (c) => {
    await logout(c.req.valid("json").refreshToken);

    return c.body(null, 204);
  })
  /**
   * Called server-to-server by packages/auth (next-auth credentials provider),
   * which needs the safe user shape or a 401 — it mints its own session cookie,
   * so no token is issued here.
   *
   * `gymId` is part of the response because the web app is multi-tenant and
   * every query it makes has to filter by it; without it the session cannot
   * scope anything. Never add `passwordHash` to this — `toAuthUser` in the
   * service is what guarantees it is absent.
   */
  .post("/verify", zValidator("json", credentialsSchema), async (c) => {
    const { phone, password } = c.req.valid("json");
    const user = await verifyCredentials(phone, password);

    if (!user) {
      return c.json(
        {
          error: {
            code: "invalid_credentials",
            message: "Invalid phone number or password",
          },
        },
        401
      );
    }

    return c.json({
      id: user.id,
      phone: user.phone,
      name: user.name,
      role: user.role,
      gymId: user.gymId,
      branchId: user.branchId,
    });
  })
  .get("/me", requireAuth, (c) => c.json(c.get("user")));
