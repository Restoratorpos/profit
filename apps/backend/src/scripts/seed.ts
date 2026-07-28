/**
 * Seeds the first tenant: one gym, one branch, one `owner` worker.
 *
 * The `gyms` database ships empty, so without this there is no account to sign
 * in with. It deliberately goes through `register()` rather than writing rows
 * itself — a seed that inserts its own rows is a second, silently diverging
 * definition of what a valid account looks like.
 *
 *   pnpm --filter backend db:seed
 *   pnpm --filter backend db:seed -- --phone 998901234567 --password s3cret
 *
 * Re-running is safe: a phone that already has a worker is reported and skipped.
 */
import { closeDatabase } from "../db/index.js";
import { ConflictError } from "../lib/errors.js";
import { normalizePhone } from "../lib/phone.js";
import { registerSchema } from "../schemas/auth.js";
import { register } from "../services/auth.service.js";

const DEFAULTS = {
  phone: "998907661770",
  password: "1111",
  name: "Owner",
  gym: "ProFit Demo Gym",
} as const;

const readFlag = (flag: string): string | undefined => {
  const index = process.argv.indexOf(`--${flag}`);

  return index === -1 ? undefined : process.argv[index + 1];
};

const main = async (): Promise<void> => {
  const parsed = registerSchema.safeParse({
    phone: readFlag("phone") ?? DEFAULTS.phone,
    password: readFlag("password") ?? DEFAULTS.password,
    name: readFlag("name") ?? DEFAULTS.name,
    gymName: readFlag("gym") ?? DEFAULTS.gym,
  });

  if (!parsed.success) {
    process.stderr.write(`Invalid seed input:\n${parsed.error.message}\n`);
    process.exitCode = 1;
    return;
  }

  try {
    const session = await register(parsed.data);

    process.stdout.write(
      [
        "Seeded:",
        `  gym      ${session.user.gymId}  (${parsed.data.gymName})`,
        `  branch   ${session.user.branchId}  (Main)`,
        `  worker   ${session.user.id}  ${session.user.name} [${session.user.role}]`,
        "",
        "Sign in with:",
        `  phone    ${parsed.data.phone}`,
        `  password ${readFlag("password") ?? DEFAULTS.password}`,
        "",
      ].join("\n")
    );
  } catch (error) {
    if (error instanceof ConflictError) {
      process.stdout.write(
        `A worker already exists for ${normalizePhone(parsed.data.phone)} — nothing to seed.\n`
      );
      return;
    }

    throw error;
  }
};

try {
  await main();
} finally {
  await closeDatabase();
}
