# GYM

Turborepo monorepo (pnpm workspaces), originally scaffolded from **next-forge**. Two deployable apps and a set of shared `@repo/*` packages.

## Layout

```
apps/
  web/       React 19 + Vite SPA (TanStack Router/Query) → localhost:3001
  backend/   Hono API on Node (tsx/tsc, ESM)             → localhost:7090
packages/
  auth/               phone input + normalization. The next-auth half is dead —
                      see "Auth" below.
  design-system/      shadcn/ui + Tailwind v4 components
  typescript-config/  base.json (Node) / nextjs.json / react-library.json
  next-config/  seo/  storage/  internationalization/    ← orphaned, see below
```

`apps/app` (Next.js, :3000) **was deleted on 2026-07-29**, which completed the
Vite migration. Nothing renders on a server any more. Four packages outlived
their only consumer and are now unreferenced: `next-config` and `seo` were used
solely by `apps/app`, and `storage` and `internationalization` were already
unused before it went. They are dead weight, not load-bearing — delete them
when convenient.

## Commands

Run from the repo root; `--filter` targets one workspace.

| Task | Command |
|---|---|
| Dev (all) | `pnpm dev` |
| Dev (one) | `pnpm --filter web dev` / `pnpm --filter backend dev` |
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

There is **no next-auth any more.** It went with `apps/app`; the SPA talks to
the backend directly and the backend's own tokens *are* the session.

1. Sign-in form (`apps/web/src/routes/sign-in.tsx`) → `POST /auth/login`.
2. Backend checks the bcrypt hash of a **`workers`** row in MySQL. Only
   `status = 'active'` workers with a `gym_id` can authenticate.
3. The response carries a short-lived **access token in the JSON body** and a
   long-lived **refresh token in an httpOnly cookie** (`mode: "cookie"`).
4. The access token is held in memory only — never localStorage, where any XSS
   reads it. It is lost on reload and re-minted from the cookie on boot.
5. `apps/web/src/lib/api/client.ts` retries a 401 once through a **single-flight**
   `refreshSession()`, so twenty concurrent queries hitting an expired token
   produce one refresh rather than twenty racing rotations.

Rules:
- **The tenant comes from the token, never from a header.** `requireAuth` sets
  `gymId`/`workerId` from signed claims; an `x-gym-id` header on a bearer
  request is inert. See `apps/backend/src/middleware/auth.ts`.
- Refresh tokens **rotate**, and the spent one is denylisted in Redis. They
  carry a `jti` because without it two refreshes inside the same second signed
  byte-identical tokens and the second was rejected as already-revoked.
- Boot must not block on the session check. `AuthProvider` restores behind an
  `isRestoring` flag; a top-level `await` before `createRoot().render()` meant a
  hung request left a permanently blank page. `__tests__/boot.test.tsx` guards it.
- Phone numbers are stored and compared as **bare digits**. `normalizePhone` exists in *both* `packages/auth/lib/phone.ts` and `apps/backend/src/lib/phone.ts` and the two must stay identical.
- The sign-in/sign-up phone input is `packages/auth/components/phone-field.tsx`, backed by `lib/countries.ts` (Uzbekistan, Kazakhstan, Kyrgyzstan, Tajikistan, Turkmenistan, Russia). It submits one assembled bare-digit value, so forms still read a single `phone` field. The list is keyed by **ISO code** because Kazakhstan and Russia share `+7`.
- **Digit grouping is display-only.** State and the submitted value are always bare digits; `formatNational` only spaces them for reading. Never store or send a formatted string.
- Flags are inline SVG (`components/flag-icon.tsx`), **not emoji** — Windows has no country-flag glyphs, so `🇺🇿` renders as the letters "UZ" in Chrome and Edge there.
- Registration onboards a **tenant**, not a person: `POST /auth/register` creates a gym, a branch and an `owner` worker in one transaction.
- Route protection is the `_authed` layout route in `apps/web/src/routes/`, not middleware — there is no server to run middleware on.
- `callbackUrl` is attacker-controlled. Only follow it when it resolves to the same origin — see `safeDestination`.

### apps/web

Has its own `apps/web/.claude/CLAUDE.md` with the layout rules and the
route-file clobbering warning. Read it before touching routes. In brief:

- `routes/` is wiring only; `features/<name>/` owns its data, types and UI.
- Dark mode is **class-based** (`globals.css` uses `@custom-variant dark (&:is(.dark *))`). `DesignSystemProvider` therefore must pass `attribute="class"` to next-themes, whose default is `data-theme` and would silently do nothing.
- The shell owns the viewport and never scrolls; one container below the header does. `__tests__/layout.test.ts` guards it.
- "Selected" is one thing: `SELECTED_TINT` from `@repo/design-system/lib/selected` — a green wash, edge and label rather than a solid neon fill. It restates its colours twice, plain and `dark:`, because `outline` carries `dark:bg-input/30` and the `dark` variant out-specifies an unprefixed utility instead of merely following it. `__tests__/selected-state.test.ts` guards both halves.

## Conventions

- Package namespace is **`@repo/*`** everywhere. (The design-system was imported from another project under `@psy/*`; that has been renamed — don't reintroduce it.)
- **zod v4** across the repo (`z.prettifyError`, top-level `z.url()`).
- Source-only packages set `declaration: false` — pnpm's non-hoisted layout otherwise trips TS2742 on re-exported types.
- **`apps/web` aliases `@repo/*` by path in `vite.config.ts`.** Design-system files import the package by its own name and it declares no self-dependency, so Rollup cannot resolve it from the importer. Dev works without the alias; the production build does not.
- Test scripts must **not** use the `NODE_ENV=test cmd` shell prefix — this repo is developed on Windows, where that is a parse error. Vitest already sets `NODE_ENV=test`.

## Gotchas

- **This repo *is* a git repository** (it was not, earlier in its life — older notes saying otherwise are stale). `origin` is `Restoratorpos/profit`, default branch `main`. Deletions are recoverable from history, so long as the work was committed first.
- **Never `git push --all` or `--tags`.** History was rewritten on 2026-07-28 to strip a database password from a code comment, and the pre-rewrite objects still exist locally under `refs/original/*` and the `pre-rewrite-backup` tag. Pushing those republishes the secret.
- `.env*` files are editable again (the deny list was narrowed on 2026-07-26 to `secrets/**`, `*.key`, `*pem*`, `*p12*`, `*.credentials.json`). But `.claude/scripts/validate-bash.sh` still rejects any **Bash** command whose text contains `.env` — edit them with Read/Write/Edit, never shell redirection.
- **`.env.local` beats `.env`.** Both `src/env.ts` and `drizzle.config.ts` load dotenv as `config({ path: [".env.local", ".env"] })`, and with an array the **first** file wins — dotenv never overrides a key that is already set. Editing `.env` while `.env.local` still defines the same key changes nothing, silently. This is why `DB_NAME` must be set in `.env.local`.
- `.claude/scripts/validate-bash.sh` blocks any Bash command whose text contains `node_modules`, `.env`, `dist/`, `build/`, or `.git/`.
