# Migrations

**The `gyms` database was provisioned out-of-band from `gyms.sql`, not from this
folder.** The journal is intentionally empty: there is no migration history that
corresponds to what is live.

The previous baseline (`0000_remarkable_mattie_franklin.sql`) created a `users`
table belonging to the pre-FITZLY schema. That table does not exist in `gyms`
and nothing references it any more, so it was removed — leaving it would have
meant `db:migrate` silently creating a stray table in a live database.

## Before you run anything here

- **`db:push` is dangerous right now.** The database has 24 tables and
  `src/db/schema.ts` models 23 of them. `push` diffs the whole database against
  this file and will propose dropping the one it does not know about,
  `membership_freezes`.
- That one can be transcribed into `schema.ts` when a feature needs it. Until
  then, treat `gyms.sql` as the reference for its shape.
- **`devices` has five columns `gyms.sql` never had** — `port`, `username`,
  `password_enc`, `webhook_key`, `direction` — added by a targeted `ALTER` on
  2026-07-26 for the Hikvision terminals, and modelled in `schema.ts`. A baseline
  generated from this file will therefore not match `gyms.sql`; it matches what
  is live, which is the one that counts.
- **`orders.discount` and `memberships.discount`** went the same way on
  2026-07-30, for discounts at the till and on a plan sale. The SQL is kept in
  `manual/2026-07-30-discount.sql` rather than thrown away at a prompt, so the
  next baseline can be checked against it.

## Why these went in by hand

`.claude/rules/migrations.md` says never hand-write a migration, and that is the
right rule once there is a baseline. There is not one: with an empty journal
`db:generate` emits `CREATE TABLE` for all 23 modelled tables as `0000`, and
`db:migrate` would then try to create tables that already hold data. Until the
baseline below exists, a targeted `ALTER` recorded in `manual/` is the honest
path — and each one is listed above so nothing is invisible.

## Once `schema.ts` covers everything

Generate a baseline and mark it applied rather than executing it, since the
tables already exist:

```bash
pnpm --filter backend db:generate     # writes drizzle/0000_*.sql from schema.ts
# then record it in __drizzle_migrations without running the DDL
```

From that point the normal `db:generate` → review SQL → `db:migrate` flow
applies, as described in `.claude/rules/migrations.md`.
