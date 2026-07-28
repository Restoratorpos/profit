# Drizzle + MySQL Patterns

Conventions for the `migration-generator` agent and any database work in GYM. The database lives in `apps/backend`; there is no separate database package.

## Schema is transcribed, not generated (right now)

`apps/backend/src/db/schema.ts` is the source of truth **for the code**, but the
live `gyms` database was created from `gyms.sql` out-of-band. `schema.ts` models
3 of its 24 tables and `drizzle/`'s journal is empty.

So adding a table today means **matching `gyms.sql` exactly**, not designing a
shape and migrating to it. Read `apps/backend/drizzle/README.md` first.

```bash
cd apps/backend
pnpm db:generate   # diff schema.ts against drizzle/ → new migration
pnpm db:migrate    # apply pending migrations
pnpm db:seed       # first gym + branch + owner worker (idempotent)
pnpm db:studio     # browse the data
```

**`pnpm db:push` is destructive here** — it diffs against the *entire* database
and will propose dropping the 21 tables `schema.ts` does not model. **`DB_HOST`
is a remote server with real data** — confirm with the user before running
anything that writes.

## Table pattern

Transcribed from `gyms.sql`, which uses `<entity>_id` primary keys, free-form
`varchar` status columns, and no foreign keys:

```ts
import { datetime, index, mysqlTable, varchar } from "drizzle-orm/mysql-core";

export const things = mysqlTable(
  "things",
  {
    thingId: varchar("thing_id", { length: 20 }).primaryKey(),
    gymId: varchar("gym_id", { length: 20 }),
    name: varchar("name", { length: 120 }),
    // varchar, not mysqlEnum — the allowed set is enforced in TypeScript.
    status: varchar("status", { length: 16 }),
    createdAt: datetime("created_at"),
  },
  (table) => [index("idx_things_gym").on(table.gymId)]
);

export const THING_STATUSES = ["active", "archived"] as const;

export type Thing = typeof things.$inferSelect;
export type NewThing = typeof things.$inferInsert;
```

## Column conventions

| Concern | Convention |
|---|---|
| Primary key | `<entity>_id varchar(20)` holding a `nanoid(20)` (`ID_LENGTH`), minted in the **service**. `nanoid(21)` does not fit |
| Tenancy | `gym_id varchar(20)`, indexed, on nearly every table — **every query filters by it** |
| Naming | snake_case in SQL, camelCase in TS — pass the SQL name explicitly |
| Timestamps | `created_at datetime`, set by the service. Most FITZLY tables have no `updated_at` — match the table |
| Enums | FITZLY uses free-form `varchar`, not `mysqlEnum`. Define the allowed set in TS (`WORKER_ROLES`) and enforce it there |
| Foreign keys | `gyms.sql` declares **none**. Model the relationship in TS; do not assume the DB enforces it |
| Booleans | `boolean("is_x")` maps to `tinyint(1)` |
| Sizing | size for what it holds — a bcrypt hash is exactly 60 chars, though `workers.password_hash` is `varchar(255)` for headroom |

## Query conventions

Queries live in `services/` — **never** in a route.

```ts
const [worker] = await db
  .select()
  .from(workers)
  .where(eq(workers.workerId, id))
  .limit(1);
return worker ?? null;                     // Drizzle returns an array; destructure it
```

- **Scope by tenant.** Any query over gym data must filter by `gym_id`; the
  database will not do it for you.
- **Index anything you filter by.** `eq(workers.gymId, …)` is backed by `idx_workers_gym`.
- **The pool is lazy.** `mysql.createPool` opens no socket until the first query — that is what lets tests import the app without a database. Don't add eager connection code.
- **Never return a raw row.** A `Worker` carries `passwordHash`; map to a safe shape before it leaves the service.

## Current schema

Database **`gyms`** — 24 tables from `gyms.sql`, of which `schema.ts` models three:

- `gyms` — the tenant boundary. `gym_id` PK.
- `branches` — locations within a gym.
- `workers` — staff, and **the authentication table**: `worker_id` PK, `gym_id`,
  `branch_id` (nullable), `fullname`, `phone` (bare digits, indexed per gym but
  *not* unique), `role` (`varchar(32)`), `password_hash` (bcrypt, `varchar(255)`),
  `status` (only `active` may sign in).

The other 21 tables — members, memberships, plans, orders, income, expenses,
stock, attendance — are described in `gyms.sql` and in
`apps/backend/.claude/contracts/schema-contract.md`. Transcribe them as needed.
