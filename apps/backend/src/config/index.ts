import { env } from "../env.js";

export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";

export const config = {
  server: {
    port: env.PORT,
    host: env.HOST,
  },
  db: {
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
  },
  cors: {
    origins: env.CORS_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  },
  service: {
    token: env.SERVICE_TOKEN,
  },
  devices: {
    /** Encrypts terminal passwords at rest. Absent means none may be saved. */
    secret: env.DEVICE_SECRET,
    /** The address a terminal on the LAN can reach this server on. */
    callbackHost: env.DEVICE_CALLBACK_HOST,
    callbackPort: env.DEVICE_CALLBACK_PORT ?? env.PORT,
  },
  auth: {
    bcryptRounds: env.BCRYPT_ROUNDS,
    accessSecret: env.JWT_ACCESS_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    accessTtl: env.JWT_ACCESS_TTL,
    refreshTtl: env.JWT_REFRESH_TTL,
  },
} as const;
