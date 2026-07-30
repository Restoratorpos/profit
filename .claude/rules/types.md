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

**Dead as of 2026-07-29.** `packages/auth/types.ts` and `config.ts` augment
next-auth types for a consumer that no longer exists — `apps/app` was the only
one, and `apps/web` imports just `components/phone-field`, `lib/countries` and
`lib/phone`. Nothing here is load-bearing; it is waiting to be deleted along
with the rest of the next-auth half of the package.
