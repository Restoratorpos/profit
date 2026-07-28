import pino from "pino";
import { isProduction } from "../config/index.js";
import { env } from "../env.js";

export const logger = pino({
  level: env.LOG_LEVEL,
  // Structured JSON in production (for log shipping); human-readable locally.
  transport: isProduction
    ? undefined
    : {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss",
          ignore: "pid,hostname",
        },
      },
  redact: {
    paths: [
      "password",
      "*.password",
      "passwordHash",
      "*.passwordHash",
      "req.headers.authorization",
    ],
    censor: "[redacted]",
  },
});
