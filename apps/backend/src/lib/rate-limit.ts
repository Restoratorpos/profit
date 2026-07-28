import { logger } from "./logger.js";
import { isRedisAvailable, redis } from "./redis.js";

/**
 * A fixed-window counter, used to keep /auth/login from being a free password
 * oracle.
 *
 * This mattered less when only apps/app could reach the API. Once a browser
 * talks to it directly the endpoint is reachable by anyone who can route to the
 * host, and bcrypt makes each attempt expensive for *us* as well as the
 * attacker — an unthrottled login is a denial-of-service surface, not just a
 * credential-stuffing one.
 *
 * Fixed window, not a sliding log: it costs one INCR and one EXPIRE, and the
 * worst case of a burst straddling a window boundary is twice the quota, which
 * is irrelevant at these limits.
 */

export type RateLimitResult = {
  allowed: boolean;
  /** How many attempts remain in the current window. */
  remaining: number;
  /** Seconds until the window resets. Only meaningful once blocked. */
  retryAfter: number;
};

const ALLOWED = (limit: number): RateLimitResult => ({
  allowed: true,
  remaining: limit,
  retryAfter: 0,
});

let hasWarnedUnavailable = false;

/**
 * Fails **open** when Redis is unreachable, and says so once.
 *
 * A limiter that fails closed turns a cache outage into "nobody can sign in",
 * which is a worse failure than the one it defends against. Warned once per
 * process rather than per request so an outage does not bury the log.
 */
export const consumeRateLimit = async (
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> => {
  if (!isRedisAvailable()) {
    if (!hasWarnedUnavailable) {
      hasWarnedUnavailable = true;
      logger.warn("Redis is unavailable — rate limiting is not being applied");
    }

    return ALLOWED(limit);
  }

  try {
    const used = await redis.incr(key);

    // Only the request that created the key sets the expiry, so the window is
    // anchored to the first attempt rather than sliding forward on every one.
    if (used === 1) {
      await redis.expire(key, windowSeconds);
    }

    if (used <= limit) {
      return { allowed: true, remaining: limit - used, retryAfter: 0 };
    }

    const ttl = await redis.ttl(key);

    return {
      allowed: false,
      remaining: 0,
      // A key with no TTL would block forever; treat that as a full window.
      retryAfter: ttl > 0 ? ttl : windowSeconds,
    };
  } catch (error) {
    logger.error({ err: error }, "Rate limiter failed — allowing the request");
    return ALLOWED(limit);
  }
};

/**
 * Drops a counter, so a success can wipe the failures that preceded it.
 *
 * Never throws: the caller has already done the thing it was rate limiting, and
 * failing that request now would be perverse. The cost of a missed reset is
 * only that the operator keeps a smaller allowance until the window rolls over.
 */
export const resetRateLimit = async (key: string): Promise<void> => {
  if (!isRedisAvailable()) {
    return;
  }

  try {
    await redis.del(key);
  } catch (error) {
    logger.warn({ err: error }, "Failed to reset a rate-limit counter");
  }
};
