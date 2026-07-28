import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { config } from "./config/index.js";
import { closeDatabase, pingDatabase } from "./db/index.js";
import { logger } from "./lib/logger.js";
import { connectRedis, disconnectRedis } from "./lib/redis.js";

const start = async (): Promise<void> => {
  // The database is not optional: fail loudly at boot rather than on the first
  // user request.
  await pingDatabase();

  // Redis is. Nothing but /health/ready reads it today, so a missing cache
  // should degrade that probe, not stop the API from serving auth.
  try {
    await connectRedis();
  } catch (error) {
    logger.warn({ err: error }, "Redis unavailable — continuing without it");
  }

  const server = serve(
    {
      fetch: app.fetch,
      port: config.server.port,
      hostname: config.server.host,
    },
    (info) => logger.info(`API listening on http://localhost:${info.port}`)
  );

  const shutdown = (signal: string): void => {
    logger.info({ signal }, "Shutting down");

    server.close(async () => {
      await Promise.allSettled([disconnectRedis(), closeDatabase()]);
      process.exit(0);
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
};

start().catch((error) => {
  logger.fatal({ err: error }, "Failed to start API");
  process.exit(1);
});
