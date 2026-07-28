---
paths:
  - "apps/backend/src/db/schema.ts"
  - "apps/backend/drizzle/**"
owner: "backend"
updated_at: "2026-07-21"
---

# Schema Contract

Canonical database shape. MySQL, database **`gyms`** — the FITZLY multi-tenant
gym CRM.

## Source Of Truth Is Split Right Now

This is the single most important thing to know before touching the schema:

1. **`gyms.sql` describes the live database.** All 24 tables were created from
   it out-of-band. It is the reference for any table `schema.ts` does not model.
2. **`src/db/schema.ts` models only 3 of those tables** — `gyms`, `branches`,
   `workers` — because only those are on the authentication path.
3. **`drizzle/` has an empty journal.** There is no migration history matching
   what is live. See `apps/backend/drizzle/README.md`.

Consequences:

- **`db:push` is destructive.** It diffs the whole database against `schema.ts`
  and will propose dropping the 21 tables that file does not know about.
- Adding a table to `schema.ts` means transcribing it from `gyms.sql` to match
  what already exists — not inventing a shape and migrating to it.

Types are *derived*, never hand-written:

```ts
export type Worker = typeof workers.$inferSelect;
export type NewWorker = typeof workers.$inferInsert;
```

## Tenancy

`gyms > branches > everything`. The rule the database cannot enforce:

> **Every query must filter by `gym_id`.**

Gym-level (span all branches): `members`, `credentials`, `memberships`, `plans`,
`products`, `combos`, `categories`, `suppliers`, `workers`.
Branch-level (one location): `halls`, `devices`, `orders`, `income`, `expenses`,
`attendance`, `storage_actions`.

This is why `AuthUser` carries `gymId` and the access token does too — so a
request never has to re-derive which tenant it belongs to.

## Naming

- Tables: plural, `snake_case`. Primary keys are **`<entity>_id`**, not `id`
  (`worker_id`, `gym_id`, `branch_id`).
- Columns: `snake_case` in SQL, `camelCase` in the Drizzle object
  (`passwordHash: varchar("password_hash", ...)`). Keep the mapping explicit.
- Booleans read as assertions (`is_active`), timestamps as past participles
  (`created_at`, `revoked_at`).

## Standard Columns

- `<entity>_id varchar(20) PRIMARY KEY` — a `nanoid(20)`, generated in the
  service. Not auto-increment: sequential ids leak row counts and let clients
  guess neighbours. Use `ID_LENGTH` from `db/schema.ts`.
- `gym_id varchar(20)` — on nearly every table. Indexed.
- `created_at datetime` — **set by the service**, not a DB default.

There is no repo-wide `updated_at` convention here: most FITZLY tables do not
have one. Match the table you are touching.

## Column Sizing Is Load-Bearing

`varchar` lengths are chosen, not guessed, and MySQL will reject (strict mode) or
**silently truncate** if you get them wrong:

- `<entity>_id varchar(20)` — so ids are `nanoid(20)`. **`nanoid(21)` does not
  fit.** Some lookup tables use `varchar(16)` (`categories`, `combos`,
  `suppliers`); check the table.
- `workers.password_hash varchar(255)` — bcrypt output is always exactly 60
  chars; the column is oversized deliberately, leaving room to migrate to a
  longer hash without a schema change.
- `phone varchar(20)` — bare digits, so no `+`, spaces, or dashes are stored.

If a value can exceed its column, widen the column. Do not trim the value to fit.

## Constraints Are Weaker Than They Look

`gyms.sql` declares **no foreign keys and almost no unique constraints** — it is
indexes and primary keys only. Several correctness rules therefore live in the
service layer, not the database:

| Rule | Enforced by |
| --- | --- |
| One account per phone number | `register()` — SQL only indexes `(gym_id, phone)` |
| Roles are a known set | `WORKER_ROLES` in `schema.ts`; SQL is `varchar(32)` |
| Status is a known set | `WORKER_STATUSES`; SQL is `varchar(16)` |
| One open order per member | application code |
| Active credentials unique per `(gym_id, type, value)` | application code |

Do not assume the database will catch a violation. If you add a rule, add it in
a service and note it here.

## Tables Modelled In `schema.ts`

### `workers` — the authentication table

| Column | Type | Notes |
| --- | --- | --- |
| `worker_id` | `varchar(20)` | PK, `nanoid(20)` |
| `gym_id` | `varchar(20)` | indexed. A worker without one cannot be tenant-scoped and is refused at login |
| `branch_id` | `varchar(20)` | nullable — gym-level staff are not tied to a location |
| `fullname` | `varchar(200)` | |
| `phone` | `varchar(20)` | bare digits — **the login identity**. Indexed as `(gym_id, phone)`, *not* unique |
| `role` | `varchar(32)` | one of `WORKER_ROLES`; unknown values degrade to least privilege |
| `login` | `varchar(64)` | kept in step with `phone`; unused by auth today |
| `password_hash` | `varchar(255)` | bcrypt. Never selected into a response. |
| `status` | `varchar(16)` | only `active` may authenticate |
| `salary_*`, `expected_start`, `late_grace_min`, `hired_at` | | payroll/attendance, not auth |

### `gyms`

| Column | Type | Notes |
| --- | --- | --- |
| `gym_id` | `varchar(20)` | PK — the tenant boundary |
| `gym`, `owner_name`, `phone`, `plan_tier` | | |
| `is_active` | `tinyint(1)` | default 1 |

### `branches`

| Column | Type | Notes |
| --- | --- | --- |
| `branch_id` | `varchar(20)` | PK |
| `gym_id` | `varchar(20)` | indexed |
| `branch`, `address`, `phone`, `timezone`, `open_time`, `close_time` | | |
| `is_active` | `tinyint(1)` | default 1 |

`password_hash` must never reach a client — see `auth-contract.md`.

## The Other 21 Tables

Not yet in `schema.ts`. Transcribe from `gyms.sql` when a feature needs them:

`members`, `credentials`, `devices`, `attendance_events`, `attendance_sessions`,
`memberships`, `membership_freezes`, `plans`, `halls`, `categories`, `products`,
`combos`, `combo_components`, `suppliers`, `storage_actions_main`,
`storage_actions_rep`, `orders`, `order_items`, `order_item_adjustments`,
`income`, `expenses`.

Two design rules from `gyms.sql` worth knowing before you touch them:

- **Money is cash-basis.** `income`/`expenses` rows exist only when money moved.
  Debt is never stored — always computed.
- **Stock has one ledger**, `storage_actions_rep`, whose `quantity` is signed
  (+in/−out), so stock on hand is `SUM(quantity)`. `storage_actions_main` is an
  optional header for deliberate documents; a sale writes a rep row with no main
  row.
