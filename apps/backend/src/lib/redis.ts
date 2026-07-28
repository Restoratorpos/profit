import { createClient, type RedisClientType } from "redis";
import { env } from "../env.js";
import { logger } from "./logger.js";

// The annotation is load-bearing: without it TS tries to name the inferred type
// through pnpm's .pnpm/ paths and fails with TS2742 ("cannot be named").
export const redis: RedisClientType = createClient({
  url: env.REDIS_URL,
}) as RedisClientType;

// Without an error listener, a dropped connection takes the process down.
redis.on("error", (error) =>
  logger.error({ err: error }, "Redis client error")
);

export const connectRedis = async (): Promise<void> => {
  if (!redis.isOpen) {
    await redis.connect();
  }
};

export const disconnectRedis = async (): Promise<void> => {
  if (redis.isOpen) {
    await redis.quit();
  }
};

export const pingRedis = async (): Promise<void> => {
  await redis.ping();
};
