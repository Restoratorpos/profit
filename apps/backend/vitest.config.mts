import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // src/env.ts exits the process on a bad environment, so tests need values
    // for everything required. They point at nothing real — no test here talks
    // to MySQL or Redis, and both clients are lazy, so nothing dials out.
    env: {
      NODE_ENV: "test",
      DB_HOST: "localhost",
      DB_PORT: "3306",
      DB_USER: "test",
      DB_PASSWORD: "test",
      DB_NAME: "gym_test",
      REDIS_URL: "redis://localhost:6379",
      JWT_ACCESS_SECRET: "test-access-secret-at-least-16",
      JWT_REFRESH_SECRET: "test-refresh-secret-at-least-16",
      SERVICE_TOKEN: "test-service-token-at-least-16",
    },
  },
});
