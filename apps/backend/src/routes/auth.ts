import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { UnauthorizedError } from "../lib/errors.js";
import {
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from "../lib/session-cookie.js";
import { requireAuth } from "../middleware/auth.js";
import { loginRateLimit } from "../middleware/login-rate-limit.js";
import {
  changePasswordSchema,
  credentialsSchema,
  loginSchema,
  refreshSchema,
  registerRequestSchema,
  type SessionMode,
} from "../schemas/auth.js";
import {
  changePassword,
  login,
  logout,
  refreshSession,
  register,
  verifyCredentials,
} from "../services/auth.service.js";
import type { AppEnv, AuthUser } from "../types/index.js";

type Session = {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
};

/**
 * Hands a session back in whichever shape the caller asked for.
 *
 * In `cookie` mode the refresh token is **omitted from the body** and set as an
 * httpOnly cookie instead. Returning it in both places would defeat the purpose
 * — the whole reason a browser wants the cookie is that its own scripts must not
 * be able to read the long-lived token.
 */
const sessionResponse = (
  c: Context<AppEnv>,
  { refreshToken, ...rest }: Session,
  mode: SessionMode
) => {
  if (mode !== "cookie") {
    return { ...rest, refreshToken };
  }

  setRefreshCookie(c, refreshToken);

  return rest;
};

export const authRoutes = new Hono<AppEnv>()
  .post("/register", zValidator("json", registerRequestSchema), async (c) => {
    const { mode, ...input } = c.req.valid("json");

    return c.json(sessionResponse(c, await register(input), mode), 201);
  })
  /**
   * The throttle sits after validation on purpose: it keys on the *normalised*
   * phone, so every spelling of the same number shares one counter.
   */
  .post(
    "/login",
    zValidator("json", loginSchema),
    loginRateLimit,
    async (c) => {
      const { phone, password, mode } = c.req.valid("json");

      return c.json(sessionResponse(c, await login(phone, password), mode));
    }
  )
  /**
   * Takes the refresh token from the cookie when there is one, and answers in
   * kind. A browser therefore never handles the token at all: it posts an empty
   * body and gets a new access token plus a refreshed cookie.
   */
  .post("/refresh", zValidator("json", refreshSchema), async (c) => {
    const fromCookie = readRefreshCookie(c);
    const refreshToken = fromCookie ?? c.req.valid("json").refreshToken;

    if (!refreshToken) {
      /*
       * 401, not 400. The SPA calls this on every cold load to find out whether
       * it has a session — the access token lives in memory and does not survive
       * a reload — so "no token here" is the ordinary answer for a signed-out
       * visitor, not a malformed request.
       */
      throw new UnauthorizedError("Not signed in");
    }

    const session = await refreshSession(refreshToken);

    return c.json(sessionResponse(c, session, fromCookie ? "cookie" : "token"));
  })
  /**
   * Revokes a refresh token. Always 204, even for one that was already invalid —
   * see the service for why this must not be an oracle.
   *
   * Takes no bearer token: signing out has to work when the access token has
   * already expired, which is exactly when a user is most likely to try.
   */
  .post("/logout", zValidator("json", refreshSchema), async (c) => {
    const refreshToken =
      readRefreshCookie(c) ?? c.req.valid("json").refreshToken;

    if (refreshToken) {
      await logout(refreshToken);
    }

    // Unconditional: a caller asking to sign out should end up without a cookie
    // whether or not the one they sent could be read.
    clearRefreshCookie(c);

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
  .get("/me", requireAuth, (c) => c.json(c.get("user")))
  /**
   * Changing your own password. `requireAuth`, so the worker it applies to is a
   * signed claim rather than an id in the body — there is no way to spell "some
   * other account" here.
   */
  .patch(
    "/password",
    requireAuth,
    zValidator("json", changePasswordSchema),
    async (c) => {
      const { currentPassword, newPassword } = c.req.valid("json");

      await changePassword(c.get("user").id, currentPassword, newPassword);

      return c.body(null, 204);
    }
  );
