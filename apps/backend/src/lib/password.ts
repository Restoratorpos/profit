import bcrypt from "bcryptjs";
import { config } from "../config/index.js";

/**
 * `bcryptjs`, not `bcrypt` — the pure-JavaScript implementation of the same
 * algorithm, producing and reading the same `$2b$` hashes. Every password already
 * in the database keeps working; nothing was rehashed.
 *
 * The reason is packaging. `bcrypt` is a native addon, compiled against Node's
 * ABI, and this server now ships inside the desk application — where it would
 * have to be rebuilt against Electron's ABI on every machine that builds a
 * release, needing a C++ toolchain. Dropping the one native dependency is what
 * makes the backend something that can simply be copied into an installer.
 *
 * The cost is speed: pure JS is roughly two to three times slower per hash. That
 * is the right trade here — this runs a handful of logins a day at one desk, and
 * the work is deliberate anyway. It does not weaken the hash, and it does not
 * change the timing-attack property `verifyCredentials` depends on: the no-user
 * branch still pays for a full comparison.
 */

export const hashPassword = (plain: string): Promise<string> =>
  bcrypt.hash(plain, config.auth.bcryptRounds);

export const verifyPassword = (plain: string, hash: string): Promise<boolean> =>
  bcrypt.compare(plain, hash);
