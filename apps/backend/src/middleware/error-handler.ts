import type { ErrorHandler, NotFoundHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { isProduction } from "../config/index.js";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import type { AppEnv } from "../types/index.js";

/** Every error leaves this API in the same shape: { error: { code, message, details? } }. */
export const onError: ErrorHandler<AppEnv> = (error, c) => {
  const log = c.get("logger") ?? logger;

  if (error instanceof AppError) {
    /*
     * Expected outcomes are not warnings.
     *
     * A signed-out browser asking /auth/refresh whether it has a session gets a
     * 401 on every cold load; a throttled sign-in gets a 429. Logging those at
     * `warn` with a full stack trace buries the errors that actually mean
     * something, and the stack of a deliberately thrown AppError says nothing a
     * status code and a path do not.
     */
    const isExpected =
      error.status === 401 || error.status === 403 || error.status === 404;

    if (isExpected) {
      log.debug({ code: error.code, status: error.status }, error.message);
    } else {
      log.warn({ code: error.code, err: error }, error.message);
    }

    return c.json(
      {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      },
      error.status
    );
  }

  if (error instanceof ZodError) {
    return c.json(
      {
        error: {
          code: "validation_error",
          message: "Request validation failed",
          details: error.issues,
        },
      },
      400
    );
  }

  if (error instanceof HTTPException) {
    return c.json(
      { error: { code: "http_error", message: error.message } },
      error.status
    );
  }

  // Anything reaching here is a bug: log it in full, tell the caller nothing.
  log.error({ err: error }, "Unhandled error");

  return c.json(
    {
      error: {
        code: "internal_error",
        message: isProduction
          ? "Internal server error"
          : (error as Error).message,
      },
    },
    500
  );
};

export const notFound: NotFoundHandler = (c) =>
  c.json(
    {
      error: {
        code: "not_found",
        message: `No route for ${c.req.method} ${c.req.path}`,
      },
    },
    404
  );
