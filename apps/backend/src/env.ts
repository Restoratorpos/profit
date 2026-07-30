import { config } from "dotenv";
import { z } from "zod";

// .env.local wins over .env, matching the convention the Next apps already use.
config({ path: [".env.local", ".env"] });

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(7090),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),

  // MySQL, as discrete parts rather than a URL — a DSN would need the password
  // percent-encoded, and any password containing an '@' would silently
  // truncate there. (This comment used to name the real one.)
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_NAME: z.string().min(1),

  REDIS_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("30d"),

  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

  // Failed sign-ins tolerated per phone number per window. Ten is well clear of
  // an operator mistyping a password on a touchscreen, and far below what
  // guessing one needs.
  LOGIN_RATE_LIMIT: z.coerce.number().int().positive().default(10),
  LOGIN_RATE_WINDOW_SECONDS: z.coerce.number().int().positive().default(900),

  // Was shared with apps/app, which called this API server-to-server on behalf
  // of a signed-in user. **apps/app was deleted on 2026-07-29 and nothing uses
  // this any more** — a holder of this token can name any gym via `x-gym-id`,
  // so it should come out. See middleware/caller.ts for what removing it takes.
  SERVICE_TOKEN: z.string().min(16).optional(),

  // Comma-separated list of browser origins allowed to call this API.
  // :3000 is apps/app, :3001 is apps/web. apps/web normally reaches this server
  // through the Vite proxy (same-origin, so CORS never engages); the entry here
  // is for the case where it is pointed straight at this port.
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000,http://localhost:3001"),

  // Encrypts the access terminals' admin passwords at rest (see lib/secret.ts).
  // Optional so the server still boots without it — but saving a terminal
  // password is refused until it is set, rather than storing one in the clear.
  // Rotating it makes every stored terminal password undecryptable: re-enter
  // them, do not expect a migration.
  DEVICE_SECRET: z.string().min(16).optional(),

  // Where the terminals should POST their events — the address *they* can reach
  // this server on, which is a LAN address and therefore not derivable from any
  // request the browser makes. Only used to configure the device.
  DEVICE_CALLBACK_HOST: z.string().optional(),
  DEVICE_CALLBACK_PORT: z.coerce.number().int().positive().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  process.stderr.write(
    `Invalid environment:\n${z.prettifyError(parsed.error)}\n`
  );
  process.exit(1);
}

export const env = parsed.data;
