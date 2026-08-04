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
const ROTATED_PREFIX = "auth:refresh:rotated:";

const hash = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

const keyFor = (token: string): string => PREFIX + hash(token);

const rotatedKeyFor = (token: string): string => ROTATED_PREFIX + hash(token);

/**
 * How long a spent refresh token keeps answering with the replacement it was
 * already given.
 *
 * Rotation has a hole in it that only shows up in a browser: the token is
 * revoked here, on the server, while its replacement travels back inside the
 * response. Lose that response — the page is reloaded mid-flight, the dev
 * server restarts, the Wi-Fi drops — and the cookie the browser still holds is
 * already dead. The session is then unrecoverable: every later refresh presents
 * the spent token and is refused, and the operator is dumped at the sign-in
 * screen with a perfectly good session behind them. Reloading a few times in
 * quick succession is enough to hit it, because the boot refresh is in flight
 * for exactly the window a reload lands in.
 *
 * So for a minute after it is spent, a token answers with the *same* successor
 * rather than a 401. That is what makes the refresh idempotent under a lost
 * response, and one minute is far longer than any retry and far shorter than the
 * 60-day token it protects.
 */
const ROTATION_GRACE_SECONDS = 60;

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

/**
 * Remembers what a spent token was exchanged for, so the exchange can be
 * repeated if its answer went missing. See ROTATION_GRACE_SECONDS above.
 *
 * This does hold a usable credential in Redis, which the denylist above
 * deliberately does not — and it is worth being clear about the trade. The
 * exposure lasts a minute and buys an attacker who can already read Redis
 * nothing they could not get by reading the sessions themselves. What it buys
 * the front desk is that a reload during a refresh is survivable, which today it
 * is not.
 *
 * Note what is *not* recorded: sign-out denylists a token without a successor,
 * so a token the operator revoked on purpose can never be replayed through this.
 */
export const recordRotation = async (
  spent: string,
  successor: string
): Promise<void> => {
  if (!isRedisAvailable()) {
    return;
  }

  try {
    await redis.set(rotatedKeyFor(spent), successor, {
      EX: ROTATION_GRACE_SECONDS,
    });
  } catch (error) {
    // Not fatal: the rotation still happened, and the client that receives the
    // response carries on. Only a lost response degrades to today's behaviour.
    logger.warn(
      { err: error },
      "Could not record a token rotation — a lost refresh response will end the session"
    );
  }
};

/**
 * The replacement a spent token was already issued, if it is still within the
 * grace window. Null once the window has lapsed, and null for a token that was
 * revoked by signing out rather than by rotation.
 */
export const successorOf = async (spent: string): Promise<string | null> => {
  if (!isRedisAvailable()) {
    return null;
  }

  try {
    return await redis.get(rotatedKeyFor(spent));
  } catch (error) {
    logger.error({ err: error }, "Rotation record unreachable");
    return null;
  }
};
