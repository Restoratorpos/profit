import { Hono } from "hono";
import { pingDatabase } from "../db/index.js";
import { pingRedis } from "../lib/redis.js";
import type { AppEnv } from "../types/index.js";

const probe = async (check: () => Promise<void>): Promise<"up" | "down"> => {
  try {
    await check();
    return "up";
  } catch {
    return "down";
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
