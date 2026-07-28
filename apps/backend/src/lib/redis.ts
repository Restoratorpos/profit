import { createClient, type RedisClientType } from "redis";
import { env } from "../env.js";
import { logger } from "./logger.js";

/** How long boot waits for Redis before giving up and serving without it. */
const CONNECT_TIMEOUT_MS = 3000;

// The annotation is load-bearing: without it TS tries to name the inferred type
// through pnpm's .pnpm/ paths and fails with TS2742 ("cannot be named").
export const redis: RedisClientType = createClient({
  url: env.REDIS_URL,
  /*
   * Fail commands immediately while disconnected instead of queueing them.
   *
   * The default queues every command until the connection returns, so a caller
   * that checked "is Redis available?" and got the wrong answer waits forever
   * rather than erroring. Everything here is designed to degrade — the denylist
   * fails open, the throttle fails open, readiness reports "down" — and all of
   * that depends on the call *returning*.
   */
  disableOfflineQueue: true,
  socket: {
    /*
     * Exponential backoff, capped.
     *
     * The default strategy retries almost immediately and forever, which turns a
     * Redis that is merely not running into thousands of log lines a second.
     * Deliberately never gives up: the refresh denylist and the login throttle
     * both degrade gracefully while it is down, and both should start working
     * again on their own if it comes back.
     */
    reconnectStrategy: (retries) => Math.min(100 * 2 ** retries, 30_000),
  },
}) as RedisClientType;

/**
 * Whether the last thing we told the log was "Redis is unreachable".
 *
 * Without an error listener at all, a dropped connection takes the process down —
 * but logging every failed reconnect is its own problem: Redis being absent is a
 * steady state on a dev machine, and repeating that forever at ERROR trains
 * everyone to ignore the level that should mean something. Reported once when it
 * breaks, once when it comes back, and nothing in between.
 */
let hasReportedOutage = false;

redis.on("error", (error) => {
  if (hasReportedOutage) {
    return;
  }

  hasReportedOutage = true;
  logger.warn(
    { err: error },
    "Redis is unreachable — the refresh denylist and login throttle are degraded until it returns"
  );
});

redis.on("ready", () => {
  if (hasReportedOutage) {
    hasReportedOutage = false;
    logger.info("Redis reconnected");
  }
});

/**
 * Connects, or gives up after a moment and lets the caller carry on.
 *
 * The timeout is the whole point. `connect()` does **not** reject when the
 * server is unreachable — it hands off to the reconnect strategy and stays
 * pending forever — so the `try { await connectRedis() } catch {}` in index.ts
 * never caught anything and the process never reached `serve()`. Redis was
 * documented as non-fatal at boot while in practice preventing the API from
 * starting at all.
 */
/**
 * `isReady`, never `isOpen`.
 *
 * `isOpen` only means the client has not been closed — it stays true for the
 * entire time a dead connection is being retried. Guarding on it is how a
 * "Redis is unavailable, skip it" branch turns into a command that waits
 * forever. Every caller in this codebase must use this.
 */
export const isRedisAvailable = (): boolean => redis.isReady;

export const connectRedis = async (): Promise<void> => {
  if (redis.isReady) {
    return;
  }

  // The client keeps retrying in the background after we stop waiting, so this
  // rejection is expected and must not surface as an unhandled rejection.
  const attempt = redis.connect().catch(() => undefined);

  let timer: NodeJS.Timeout | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(`Redis did not connect within ${CONNECT_TIMEOUT_MS}ms`)
        ),
      CONNECT_TIMEOUT_MS
    );
  });

  try {
    await Promise.race([attempt, timeout]);
  } finally {
    clearTimeout(timer);
  }
};

export const disconnectRedis = async (): Promise<void> => {
  if (redis.isOpen) {
    await redis.quit();
  }
};

/**
 * Fails fast when the client is not connected, instead of hanging.
 *
 * node-redis queues commands while it is reconnecting, so `ping()` against a
 * disconnected client never settles — it waits for a Redis that may never come
 * back. `/health/ready` awaits this, so without the guard the readiness probe
 * hung forever rather than reporting `cache: "down"`, which is the worse
 * failure: a probe that times out looks like a wedged process rather than a
 * missing cache, and `probe()` in routes/health.ts can only catch a rejection.
 */
export const pingRedis = async (): Promise<void> => {
  if (!redis.isReady) {
    throw new Error("Redis is not connected");
  }

  await redis.ping();
};
