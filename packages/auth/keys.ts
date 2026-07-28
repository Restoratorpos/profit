import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const keys = () =>
  createEnv({
    skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
    server: {
      // Signs the session JWT. Generate one with `npx auth secret`.
      AUTH_SECRET: z.string().min(1).optional(),
      // Base URL of apps/backend, used to verify credentials once it exists.
      AUTH_BACKEND_URL: z.url().optional(),
      // Shared with apps/backend. Lets this server call the API on behalf of an
      // already-authenticated user; never sent to the browser.
      SERVICE_TOKEN: z.string().min(16).optional(),
    },
    client: {},
    runtimeEnv: {
      AUTH_SECRET: process.env.AUTH_SECRET,
      AUTH_BACKEND_URL: process.env.AUTH_BACKEND_URL,
      SERVICE_TOKEN: process.env.SERVICE_TOKEN,
    },
  });
