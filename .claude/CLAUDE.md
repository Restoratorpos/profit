# GYM

Turborepo monorepo (pnpm workspaces), originally scaffolded from **next-forge**. Two deployable apps and a set of shared `@repo/*` packages.

## Layout

```
apps/
  app/       Next.js 16 + React 19 web app        → localhost:3000
  backend/   Hono API on Node (tsx/tsc, ESM)      → localhost:7090
packages/
  auth/               Auth.js v5 (next-auth), phone + password credentials
  design-system/      shadcn/ui + Tailwind v4 components
  next-config/        shared Next config
  seo/  storage/  internationalization/
  typescript-config/  base.json (Node) / nextjs.json / react-library.json
```

## Commands

Run from the repo root; `--filter` targets one workspace.

| Task | Command |
|---|---|
| Dev (all) | `pnpm dev` |
| Dev (one) | `pnpm --filter app dev` / `pnpm --filter backend dev` |
| Typecheck | `pnpm --filter <pkg> typecheck` |
| Test | `pnpm --filter <pkg> test` (vitest) |
| Lint / format | `pnpm check` / `pnpm fix` (ultracite → biome) |
| Backend schema push | `pnpm --filter backend db:push` |

## Architecture

### apps/backend

Hono + Drizzle + MySQL + Redis. The database is **`gyms`** — the FITZLY
multi-tenant gym CRM (`gyms > branches > everything`, and **every query filters
by `gym_id`**). It was provisioned from `gyms.sql` out-of-band, so `drizzle/` has
no baseline and `src/db/schema.ts` models 23 of its 24 tables — which still makes
`db:push` destructive today. Read `apps/backend/drizzle/README.md` before any
schema work.

Source-of-truth layout under `src/`:

```
app.ts      Hono app (middleware + routes) — built separately from the server
index.ts    server bootstrap, graceful shutdown
env.ts      zod-validated process.env; exits the process if invalid
config/     typed config derived from env
db/         drizzle pool (mysql2) + schema.ts
lib/        logger (pino), jwt, password (bcrypt), redis, phone, errors
middleware/ request-context (requestId + child logger), error-handler, auth
routes/     health, auth
schemas/    zod request schemas
services/   business logic — the only layer that touches the db
types/      AppEnv (Hono context) + AuthUser
```

Conventions that will bite you if ignored:

- **ESM + `NodeNext`**: every relative import needs a `.js` extension (`./config/index.js`), even from a `.ts` file. `tsc` builds to `dist/`; `node dist/index.js` runs it.
- **Errors**: throw an `AppError` subclass (`lib/errors.ts`) for anything the client should see. Everything else becomes a 500 with no internals leaked. All errors serialize as `{ error: { code, message, details? } }`.
- **Env is discrete DB parts**, not a DSN (`DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME`) — a password containing `@` would truncate inside a `mysql://` URL.
- **Tokens are split**: `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are different secrets, so an access token cannot be replayed as a refresh token. `refreshSession()` re-reads the user from the DB rather than trusting the token.
- **`/health`** is dependency-free liveness; **`/health/ready`** probes MySQL + Redis. Redis is *not* fatal at boot — only the readiness probe depends on it.

### Auth flow (the load-bearing part)

1. Sign-in form (`packages/auth/components/sign-in.tsx`) → next-auth credentials provider.
2. `packages/auth/lib/verify-credentials.ts` → `POST {AUTH_BACKEND_URL}/auth/verify` on apps/backend.
3. Backend checks the bcrypt hash of a **`workers`** row in MySQL, returns `{ id, phone, name }` or **401**. Only `status = 'active'` workers with a `gym_id` can authenticate.
4. next-auth mints its own JWT session cookie. The backend's own tokens are for API clients, not the web session.

Rules:
- `verifyCredentials` returns `null` **only** on a genuine 401. Anything else throws — a backend outage must not be indistinguishable from a wrong password.
- **`/auth/verify` returns exactly `{ id, phone, name }`**, so `gymId`/`branchId`/`role` reach the API token but **not** the web session. This was originally forced — a `Read(./**/*credential*)` deny rule hid `packages/auth/lib/verify-credentials.ts` — but that glob was narrowed on 2026-07-26 and the file is editable again. Widening the response is now a decision, not a blocker: change the backend and `verify-credentials.ts` together.
- Phone numbers are stored and compared as **bare digits**. `normalizePhone` exists in *both* `packages/auth/lib/phone.ts` and `apps/backend/src/lib/phone.ts` and the two must stay identical.
- The sign-in/sign-up phone input is `packages/auth/components/phone-field.tsx`, backed by `lib/countries.ts` (Uzbekistan, Kazakhstan, Kyrgyzstan, Tajikistan, Turkmenistan, Russia). It submits one assembled bare-digit value, so forms still read a single `phone` field. The list is keyed by **ISO code** because Kazakhstan and Russia share `+7`.
- **Digit grouping is display-only.** State and the submitted value are always bare digits; `formatNational` only spaces them for reading. Never store or send a formatted string.
- Flags are inline SVG (`components/flag-icon.tsx`), **not emoji** — Windows has no country-flag glyphs, so `🇺🇿` renders as the letters "UZ" in Chrome and Edge there.
- Registration onboards a **tenant**, not a person: `POST /auth/register` creates a gym, a branch and an `owner` worker in one transaction.
- Middleware (`packages/auth/config.ts` → `authorized`) has three tiers: `/api/auth` + `/api/register` are always public; `/sign-in` + `/sign-up` are public only when signed **out** (signed-in users get redirected away); everything else needs a session.
- `callbackUrl` is attacker-controlled. Only follow it when it resolves to the same origin — see `resolveCallbackUrl` (server) and `safeDestination` (client).

### apps/app

- `app/(unauthenticated)/` — sign-in / sign-up. `app/(authenticated)/` — everything behind the session.
- `AuthProvider` (SessionProvider) is mounted in the **root** layout, not in `(authenticated)` — `useSession()` is called from the sidebar and throws anywhere the provider is absent.
- Dark mode is **class-based** (`globals.css` uses `@custom-variant dark (&:is(.dark *))`). `DesignSystemProvider` therefore must pass `attribute="class"` to next-themes, whose default is `data-theme` and would silently do nothing.

## Conventions

- Package namespace is **`@repo/*`** everywhere. (The design-system was imported from another project under `@psy/*`; that has been renamed — don't reintroduce it.)
- **zod v4** across the repo (`z.prettifyError`, top-level `z.url()`).
- Next apps and the source-only packages they import set `declaration: false` — pnpm's non-hoisted layout otherwise trips TS2742 on next-auth's re-exported `@auth/core` types.
- Test scripts must **not** use the `NODE_ENV=test cmd` shell prefix — this repo is developed on Windows, where that is a parse error. Vitest already sets `NODE_ENV=test`.

## Gotchas

- **This repo is not a git repository.** There is no `.git` — deletions and overwrites are unrecoverable. Back up before destructive changes.
- `.env*` files are editable again (the deny list was narrowed on 2026-07-26 to `secrets/**`, `*.key`, `*pem*`, `*p12*`, `*.credentials.json`). But `.claude/scripts/validate-bash.sh` still rejects any **Bash** command whose text contains `.env` — edit them with Read/Write/Edit, never shell redirection.
- **`.env.local` beats `.env`.** Both `src/env.ts` and `drizzle.config.ts` load dotenv as `config({ path: [".env.local", ".env"] })`, and with an array the **first** file wins — dotenv never overrides a key that is already set. Editing `.env` while `.env.local` still defines the same key changes nothing, silently. This is why `DB_NAME` must be set in `.env.local`.
- `.claude/scripts/validate-bash.sh` blocks any Bash command whose text contains `node_modules`, `.env`, `dist/`, `build/`, or `.git/`.
