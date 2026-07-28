import { keys as auth } from "@repo/auth/keys";
import { keys as core } from "@repo/next-config/keys";
import { createEnv } from "@t3-oss/env-nextjs";

export const env = createEnv({
  skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
  extends: [auth(), core()],
  server: {},
  client: {},
  runtimeEnv: {},
});
