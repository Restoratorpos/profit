---
paths: "apps/backend/src/types/**"
---

# Type Rules

## Invariants

- **Derive from the schema; don't restate it.** Row shapes come from Drizzle: `typeof workers.$inferSelect`. Never hand-write an interface that mirrors a table.
- **`AppEnv` is the Hono context contract.** Anything a middleware hangs on the context (`c.set(...)`) must be declared in `AppEnv["Variables"]`, or `c.get(...)` is untyped.
- **`AuthUser` is the safe user shape** — id, phone, name, role, **gymId**, branchId. It is what leaves the service layer and what a JWT carries. It deliberately has no `passwordHash`. `gymId` is part of the identity, not a lookup: the system is multi-tenant and every query filters by it.
- **`UserRole` derives from `WORKER_ROLES`** in `db/schema.ts`, so the union and the runtime-validated set cannot drift.
- **No runtime code in type files.** Types and `type`-only exports only.
- Use `type` for unions, aliases and object shapes here (the backend is not bound by the React `interface` preference); use `import type` for type-only imports.

## Note on next-auth types

`packages/auth/types.ts` augments next-auth's `User` and `Session` with `phone`. It is a **`.ts` module side-effect imported by `config.ts`**, not a loose `.d.ts` — a `.d.ts` nobody imports is only picked up when that package compiles itself, so consumers like `apps/app` never saw the augmentation and every `session.user.phone` failed to typecheck.

Do not add a `declare module "next-auth/jwt"` block: that subpath re-exports `@auth/core/jwt`, a transitive dependency pnpm does not hoist, so TypeScript cannot resolve it and rejects the augmentation (TS2664). `JWT` already has an index signature — narrow on read instead.
