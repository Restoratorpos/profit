# apps/backend — API Workspace

> Hono + Drizzle + MySQL. This workspace owns the user store, password hashing,
> and every HTTP contract the web app depends on. It is the only thing allowed
> to talk to the database.

## Stack

- **Runtime**: Node (`@hono/node-server`), ESM, TypeScript `NodeNext`
- **HTTP**: Hono 4 — routers compose in `src/routes/`
- **Validation**: Zod 4 via `@hono/zod-validator`
- **DB**: Drizzle ORM + `mysql2` pool → MySQL (`gyms` — the FITZLY schema)
- **Cache/session store**: Redis
- **Auth**: bcrypt hashes, `jsonwebtoken` for API tokens
- **Logging**: pino. **Tests**: Vitest. **Dev**: `tsx watch`

## Layout

| Path | Owns |
| --- | --- |
| `src/env.ts` | The **only** place `process.env` is read. Zod-validated; exits on invalid. |
| `src/config/` | Typed view over `env` — everything else imports `config`, never `env`. |
| `src/app.ts` | Builds the Hono app (middleware + routes). Binds no port. |
| `src/index.ts` | Starts the server, pings DB, connects Redis, handles shutdown. |
| `src/routes/` | HTTP surface only: validate, call a service, shape the response. |
| `src/services/` | Business logic. No `Context`, no HTTP status codes. |
| `src/schemas/` | Zod request schemas. Source of truth for input shape. |
| `src/db/` | Drizzle pool + `schema.ts` table definitions. |
| `src/lib/` | Cross-cutting primitives: `errors`, `jwt`, `password`, `phone`, `redis`. |
| `src/middleware/` | `caller` (`requireCaller` — the door every feature route uses), `auth` (`requireAuth`), `service` (`requireService`, being retired), `login-rate-limit`, `error-handler`, `request-context`. |
| `drizzle/` | Generated SQL migrations. Forward-only. |

## Invariants

- **`app.ts` never binds a port.** It is built separately from the server that
  runs it so tests can drive it with `app.request()` — keep it that way.
- **Routes stay thin.** Logic belongs in a service; a route that reaches for the
  `db` import directly is a bug.
- **Nothing outside `env.ts` reads `process.env`.** Add a var to the Zod schema
  in `env.ts`, surface it through `config/`, then use it.
- **Password hashes never leave a service.** `toAuthUser()` strips
  `passwordHash`; anything returning a raw `User` row is a leak.
- **Credential failures are indistinguishable.** Never reveal whether a phone
  number exists — not in the message, not in the status, not in the timing (the
  no-user branch in `verifyCredentials` still pays for a bcrypt hash on purpose).
- **Errors go through `AppError`.** Throw a subclass from `lib/errors.ts`; the
  error handler renders it. Anything else is a bug and flattens to a 500 with no
  internals leaked.
- **Feature routes mount `requireCaller`, not `requireService`.** It accepts a
  per-user bearer token *or* the legacy shared token and sets the same
  `gymId`/`workerId` either way, so handlers cannot tell the difference. Under a
  bearer token `x-gym-id` is never read — the tenant is a signed claim. See
  `contracts/api-contract.md`.
- **ESM import specifiers carry `.js`** (`from "../db/index.js"`), even for
  TypeScript sources. `NodeNext` requires it.
- **`lib/phone.ts` must stay byte-identical to `packages/auth/lib/phone.ts`.**
  Both sides normalize to bare digits; a divergence silently fails every login.

## Contracts

Read the one that covers what you are changing:

- `contracts/api-contract.md` — routes, response/error envelope, the
  `/auth/verify` contract the web app logs in through
- `contracts/auth-contract.md` — passwords, tokens, phone normalization
- `contracts/schema-contract.md` — table shape and naming
- `contracts/migration-conventions.md` — how schema changes reach the database

## Commands

Run from the repo root:

```bash
pnpm --filter backend dev         # tsx watch, listens on PORT (7090)
pnpm --filter backend test        # vitest
pnpm --filter backend typecheck   # tsc --noEmit
pnpm --filter backend db:generate # schema.ts -> drizzle/*.sql
pnpm --filter backend db:migrate  # apply pending migrations
```

## Change Flow

1. Add/adjust the Zod schema in `src/schemas/`.
2. Put the logic in a service; keep the route a validate-and-delegate shell.
3. Changing tables? `db:generate`, read the SQL, then `db:migrate`
   (see `contracts/migration-conventions.md`).
4. Cover it in `__tests__/` with `app.request()` — no port, no live DB.
5. `pnpm --filter backend typecheck && pnpm --filter backend test`.

## Gotchas

- **Never guard on `redis.isOpen` — use `isRedisAvailable()` (`redis.isReady`).**
  `isOpen` only means the client has not been *closed*; it stays `true` for the
  whole time a dead connection is being retried. Every "is Redis up? if not,
  skip it" branch written against `isOpen` therefore takes the *happy* path
  while Redis is down, and the command lands in node-redis' offline queue and
  never resolves. This is what made **every `/auth/login` hang forever** with no
  error: `/auth/verify` (no rate limiter) answered in 0.5s while `/auth/login`
  (same DB, same bcrypt, plus `loginRateLimit`) timed out. The client also sets
  `disableOfflineQueue: true` so a mistake here fails fast instead of hanging.

- **A salary expense's `action_id` holds the month it settles**, as
  `salary:YYYY-MM` — not a link to another document. A wage is earned in one
  month and usually handed over in the next, and `paid_at` alone cannot tell
  those apart. `lib/payroll.ts` owns the format; anything summing wages over a
  range must go through `salaryPaidIn`, and anything reading `action_id`
  generically must exclude salary rows (`transaction.service.ts` →
  `expenseLinkOf`) or it will treat a period as a document and refuse to void
  the payment.

- `PORT=7090`. The web app reaches this API via `AUTH_BACKEND_URL` in
  `apps/app/.env.local` — **the two must agree**, or every login fails against a
  dead port.
- The database is **remote and shared** (`gyms`, on a host carrying ~30 other
  databases). `schema.ts` models 23 of its 24 tables, so `db:push` **will**
  propose dropping `membership_freezes` — see `drizzle/README.md`.
- `DB_NAME` must be set in `apps/backend/.env.local`, not just `.env`: dotenv is
  loaded as `config({ path: [".env.local", ".env"] })` and the **first** file
  wins, so a value in `.env.local` silently overrides `.env`.
- `src/index.ts` pings MySQL and connects Redis at boot and exits if either is
  down — a failure to start is usually infrastructure, not code.
