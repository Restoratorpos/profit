---
paths:
  - "apps/backend/drizzle/**"
  - "apps/backend/drizzle.config.ts"
  - "apps/backend/src/db/schema.ts"
owner: "backend"
updated_at: "2026-07-21"
---

# Migration Conventions

How a change to `src/db/schema.ts` reaches MySQL.

## Read This First: There Is No Baseline

The live `gyms` database was created from **`gyms.sql`**, not from `drizzle/`.
The journal is deliberately empty, and `schema.ts` models only 3 of the 24 live
tables. So the flow below does **not** yet apply cleanly — see
`apps/backend/drizzle/README.md` before generating anything.

Adding one of the 21 unmodelled tables to `schema.ts` is a *transcription* job:
match `gyms.sql` exactly, and do not migrate. Generating a migration for a table
that already exists will try to `CREATE` it again.

## The Database Is Remote And Shared

`gyms` lives on a shared host carrying ~30 other databases, not on your laptop.
It is not disposable, and a migration there is not a local experiment. Two
consequences:

- **Never `db:push` against it.** `push` diffs your schema against the *entire*
  database and will happily propose dropping tables it does not know about —
  today that is 21 real tables. It is a tool for throwaway local databases.
- Generated SQL gets **read before it is applied**, every time.

## The Flow

```bash
# 1. Edit src/db/schema.ts, then generate the SQL:
pnpm --filter backend db:generate

# 2. READ drizzle/<timestamp>_<name>.sql. This is the step people skip.
#    Confirm it does only what you meant. Look for: DROP, a narrowed varchar,
#    a NOT NULL added to a populated table, or a rename — Drizzle may render a
#    rename as drop + add, which silently discards the column's data.

# 3. Apply it:
pnpm --filter backend db:migrate
```

`drizzle-kit` names migration files itself. Never hand-name one and never
reorder them: applied migrations are tracked by filename.

## Forward-Only

Applied migrations are immutable. Do not rewrite, renumber, or delete one — the
database has already run it, and editing the file only desynchronizes the record
from reality.

Wrong migration? Write a **new** one that corrects it.

## Destructive Changes Are Two Migrations, Not One

Dropping a column in the same deploy that stops using it breaks the running
instance in between. Split it:

1. Add the new column, backfill it, write to both.
2. Ship the code that reads the new column.
3. *Then* drop the old one.

The `password_hash varchar(60)` rule in `schema-contract.md` is the cautionary
case: a migration that narrows a populated column truncates data without
erroring.

## Checklist

- [ ] `schema.ts` edited — not the generated SQL.
- [ ] `db:generate` run, and the generated SQL actually **read**.
- [ ] No unintended `DROP`, narrowing, or rename-as-drop-and-add.
- [ ] `db:migrate` applied.
- [ ] `pnpm --filter backend typecheck` — the inferred `User` / `NewUser` types
      move with the schema, so a breaking change shows up here.
- [ ] Migration file committed **together with** the `schema.ts` change.
