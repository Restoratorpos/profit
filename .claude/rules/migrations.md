---
paths: apps/backend/src/db/**
---

# Drizzle Schema Rules

`apps/backend/src/db/schema.ts` is the single source of truth. The schema is **code-first**: edit the TypeScript, then generate SQL from it.

## Required reading
- @.claude/skills/database-patterns/SKILL.md

## Invariants

- **The live `gyms` database was provisioned from `gyms.sql`, not from `drizzle/`.** The migration journal is empty on purpose — see `apps/backend/drizzle/README.md` before generating or applying anything.
- **`schema.ts` models 23 of the 24 live tables.** Only `membership_freezes` is not modelled — transcribe it from `gyms.sql` when a feature needs it.
- **Never hand-write a migration**, and never edit one already applied. Change `schema.ts` and run `pnpm db:generate`, then `pnpm db:migrate`.
- **`pnpm db:push` is currently destructive** — it diffs the whole database against `schema.ts` and will propose dropping `membership_freezes`, the one table that file does not yet model.
- **`DB_HOST` points at a remote server holding real data.** Confirm with the user before running anything that writes schema.
- **Ids are `varchar(20)` nanoids generated in the service layer** — not auto-increment, not a DB default. FITZLY's tables declare `VARCHAR(20)`, so mint them with `nanoid(20)` (`ID_LENGTH` in `db/schema.ts`). `nanoid(21)` does not fit and MySQL will reject it in strict mode, or silently truncate outside it.
- **snake_case in SQL, camelCase in TS**: `passwordHash: varchar("password_hash", …)`.
- **`created_at` is `DATETIME`, set by the service.** FITZLY's tables do not use `.defaultNow()`/`.onUpdateNow()`, and most carry no `updated_at` at all — match the table you are touching rather than assuming.
- **Index every column a service filters on.** Name them `<table>_<column>_idx`.
- **Export `$inferSelect` / `$inferInsert`** beside each table so services never restate a row shape.
- **The pool is lazy.** `mysql.createPool` opens no socket until the first query — that is what lets tests import the app with no database running. Don't add eager connection code to `db/`.

## After changing the schema

`pnpm --filter backend typecheck` — a schema change that breaks a service surfaces there, not at runtime.
