import { createMiddleware } from "hono/factory";
import { config } from "../config/index.js";
import { TooManyRequestsError } from "../lib/errors.js";
import { consumeRateLimit, resetRateLimit } from "../lib/rate-limit.js";
import type { AppEnv } from "../types/index.js";

/**
 * Throttles sign-in attempts per phone number.
 *
 * Mount it *after* `zValidator("json", credentialsSchema)` so the phone has
 * already been normalised to bare digits — otherwise "+998 90 766 17 70" and
 * "998907661770" are two different buckets and the limit is trivially evaded.
 *
 * Keyed on the phone alone, deliberately not on the client address. This runs on
 * a LAN behind no proxy, so there is no trustworthy per-client IP: every request
 * would collapse into one bucket and the first ten bad passwords of the morning
 * would lock out the entire front desk. Per-phone keying protects the thing
 * actually under attack — one account's password — without that failure mode.
 *
 * Only *failed* attempts count. A correct password clears the counter, so an
 * operator who fumbles a few times and then gets it right starts clean.
 */
export const loginRateLimit = createMiddleware<
  AppEnv,
  never,
  { in: { json: { phone: string } }; out: { json: { phone: string } } }
>(async (c, next) => {
  const { phone } = c.req.valid("json");
  const key = `auth:login:${phone}`;
  const { loginRateLimit: limit, loginRateWindowSeconds: window } = config.auth;

  const result = await consumeRateLimit(key, limit, window);

  if (!result.allowed) {
    c.get("logger").warn(
      { phone, retryAfter: result.retryAfter },
      "Sign-in attempts throttled"
    );

    throw new TooManyRequestsError(
      "Too many sign-in attempts. Try again later.",
      result.retryAfter
    );
  }

  await next();

  // A successful sign-in is not an attempt worth remembering.
  if (c.res.status < 400) {
    await resetRateLimit(key);
  }
});
