import { createHash } from "node:crypto";
import { logger } from "./logger.js";
import { isRedisAvailable, redis } from "./redis.js";

/**
 * Revocation for refresh tokens.
 *
 * A JWT is valid until it expires — signing it is the whole authorisation — so
 * "sign out" and "rotate on use" both need somewhere to record that a
 * particular token must not be honoured again. Redis holds those until the
 * moment they would have lapsed on their own, so the set stays bounded without
 * anyone sweeping it.
 *
 * Tokens are keyed by SHA-256 rather than stored whole: the denylist is a
 * lookup, never a source, and a dump of Redis should not hand out working
 * credentials.
 */

const PREFIX = "auth:refresh:denied:";

const keyFor = (token: string): string =>
  PREFIX + createHash("sha256").update(token).digest("hex");

/** Seconds until `expiresAt`, floored at 1 — Redis rejects a TTL of 0. */
const ttlSeconds = (expiresAt: Date): number =>
  Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));

export const denyRefreshToken = async (
  token: string,
  expiresAt: Date
): Promise<void> => {
  if (!isRedisAvailable()) {
    // Loud, because this one *is* a security event: the user asked to be signed
    // out and the token remains usable until it expires on its own.
    logger.error(
      "Redis is unavailable — a refresh token could not be revoked and stays valid until it expires"
    );
    return;
  }

  try {
    await redis.set(keyFor(token), "1", { EX: ttlSeconds(expiresAt) });
  } catch (error) {
    logger.error({ err: error }, "Failed to revoke a refresh token");
  }
};

/**
 * Fails **open**: an unreachable Redis answers "not revoked".
 *
 * The alternative is that a Redis blip signs out every operator at once and no
 * one can get back in — on a front desk mid-shift that is the worse outcome,
 * and it is why src/index.ts already treats Redis as non-fatal at boot. The
 * exposure is bounded: access tokens last minutes, so the window where a
 * revoked *refresh* token still buys anything is small, and it costs an
 * attacker a stolen token plus a Redis outage at the same moment.
 */
export const isRefreshTokenDenied = async (token: string): Promise<boolean> => {
  if (!isRedisAvailable()) {
    return false;
  }

  try {
    return (await redis.exists(keyFor(token))) === 1;
  } catch (error) {
    logger.error(
      { err: error },
      "Refresh-token denylist unreachable — allowing the token"
    );
    return false;
  }
};
