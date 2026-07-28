import type { DefaultSession } from "next-auth";
import type { WorkerRole } from "./lib/verify-credentials";

/**
 * Augments next-auth with the phone-based fields this app uses.
 *
 * This lives in a .ts module (not a .d.ts) and is side-effect imported by
 * config.ts on purpose: a loose .d.ts is only picked up when packages/auth
 * compiles itself, so consumers like apps/app never saw `phone` and every
 * `session.user.phone` failed to typecheck.
 */
declare module "next-auth" {
  interface User {
    branchId: string | null;
    gymId: string;
    phone: string;
    role: WorkerRole;
  }

  interface Session {
    user: {
      id: string;
      phone: string;
      role: WorkerRole;
      /** The tenant. Every query the app makes must filter by it. */
      gymId: string;
      branchId: string | null;
    } & DefaultSession["user"];
  }
}

// No `declare module "next-auth/jwt"` here on purpose: that subpath re-exports
// @auth/core/jwt, a transitive dependency pnpm does not hoist, so TypeScript
// cannot resolve it and rejects the augmentation (TS2664). JWT already carries
// an index signature, so config.ts narrows the two claims on read instead.
