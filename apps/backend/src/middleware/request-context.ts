import { createMiddleware } from "hono/factory";
import { nanoid } from "nanoid";
import { logger } from "../lib/logger.js";
import type { AppEnv } from "../types/index.js";

/**
 * Stamps every request with an id and a logger bound to it, so all lines from
 * one request can be grepped together. Honours an inbound x-request-id so a
 * trace survives across services.
 */
export const requestContext = createMiddleware<AppEnv>(async (c, next) => {
  const requestId = c.req.header("x-request-id") ?? nanoid(12);
  const requestLogger = logger.child({ requestId });

  c.set("requestId", requestId);
  c.set("logger", requestLogger);
  c.header("x-request-id", requestId);

  const startedAt = performance.now();

  await next();

  requestLogger.info(
    {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Math.round(performance.now() - startedAt),
    },
    "request completed"
  );
});
