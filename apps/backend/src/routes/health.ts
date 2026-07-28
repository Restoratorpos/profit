import { Hono } from "hono";
import { pingDatabase } from "../db/index.js";
import { pingRedis } from "../lib/redis.js";
import type { AppEnv } from "../types/index.js";

/** A dependency that does not answer this quickly is down as far as we care. */
const PROBE_TIMEOUT_MS = 2000;

/**
 * Checks one dependency, and is guaranteed to answer.
 *
 * The timeout is not belt-and-braces. A `catch` only helps if the check
 * actually rejects, and neither of these reliably does: node-redis queues
 * commands while it reconnects, and a pool waiting on an unreachable host sits
 * on the connect timeout. Without a bound, readiness hung rather than reporting
 * "degraded" — which reads to an orchestrator as a wedged process and gets the
 * container killed, instead of as a cache that needs starting.
 */
const probe = async (check: () => Promise<void>): Promise<"up" | "down"> => {
  let timer: NodeJS.Timeout | undefined;

  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("probe timed out")),
      PROBE_TIMEOUT_MS
    );
  });

  try {
    await Promise.race([check(), expiry]);
    return "up";
  } catch {
    return "down";
  } finally {
    clearTimeout(timer);
  }
};

export const healthRoutes = new Hono<AppEnv>()
  // Liveness: is the process up? Deliberately touches no dependency, so a dead
  // database never gets the container killed and restarted in a loop.
  .get("/", (c) => c.json({ status: "ok", uptime: process.uptime() }))
  // Readiness: can it actually serve traffic?
  .get("/ready", async (c) => {
    const [database, cache] = await Promise.all([
      probe(pingDatabase),
      probe(pingRedis),
    ]);

    const ready = database === "up" && cache === "up";

    return c.json(
      { status: ready ? "ok" : "degraded", database, cache },
      ready ? 200 : 503
    );
  });
