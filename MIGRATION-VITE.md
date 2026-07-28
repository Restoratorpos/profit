# Migrating `apps/app` from Next.js to React + Vite

Written 2026-07-28.

| Phase | Status |
|---|---|
| 0 — git | **done** (`95c06ec`) |
| 1 — backend per-user auth | **done** — shipped as `requireCaller` |
| 2 — scaffold `apps/web` | **done** (`c634ebc`) — shell only, no data |
| 3 — SPA auth | **done** — sign-in, guards, refresh cookie, TanStack Router |
| 4 — 9 feature verticals | not started — **unblocked** |
| 5 — cutover, delete `apps/app` | not started |

## The headline

This is a **backend auth migration wearing a frontend costume**.

The React port itself is mechanical and low-risk. The load-bearing work is that
**all 90 feature endpoints on `apps/backend` are behind `requireService`** — a
shared `SERVICE_TOKEN` plus a client-supplied `x-gym-id` header. That model only
works because a trusted Next server sits in front and is the only caller.

A Vite SPA has no server. The browser cannot hold `SERVICE_TOKEN`, and must
never be trusted to name its own tenant. `apps/backend/src/middleware/service.ts`
says so itself:

> The trade-off is explicit: anything holding SERVICE_TOKEN can name any gym.
> That is acceptable while both processes are first-party and the API is not
> publicly routable. Do not expose this API to the internet without moving to
> per-user tokens (`requireAuth`), which bind the tenant into a signed claim
> instead of a header.

So the migration forces a security change that is already on the books. Plan
around that and everything else falls out.

## What is actually there

Measured, not estimated:

| | Count |
|---|---|
| `.ts`/`.tsx` under `apps/app/{app,lib}` | 118 |
| `"use client"` files (port ~unchanged) | 56 |
| Server components / pages (must be rewritten) | 31 |
| `"use server"` files (12 `actions.ts` + 4 lib) | 13 |
| Backend endpoints total / feature-only | 97 / 90 |
| `requireService` attachment points across 9 route files | ~21 |
| `c.get("gymId")` / `c.get("workerId")` call sites | ~111 |

Next.js API surface in use:

| API | Files | Replacement |
|---|---|---|
| `next/navigation` (`useRouter`, `redirect`, `notFound`) | 10 | react-router |
| `next/cache` (`revalidatePath`) | 10 | `queryClient.invalidateQueries` |
| `next/link` | 8 | react-router `<Link>` |
| `next/og` (`ImageResponse`) | 3 | static PNGs — already in `.brand-backup/` |
| `next/headers` (`cookies`) | 2 | `document.cookie` / `localStorage` |
| `next/server` (`NextResponse`) | 1 | delete (`/api/register` moves to backend) |
| `next/dynamic` | 2 | `React.lazy` |
| `next/font/google` | 1 | `@fontsource/*`, self-hosted |
| `next/error` | 1 | error boundary |

### What ports for free

- **`@repo/design-system`** — essentially Next-free. Only 4 files touch anything
  Next-adjacent, and it is `next-themes`, which works in any React app. The
  whole shadcn layer moves with an import path change and nothing else.
- **All 56 `"use client"` files** — views, sheets, dialogs, tables. These are
  ordinary React. They change imports, not logic.
- **`@repo/auth/lib/countries` (14 importers), `phone.ts`, `phone-field.tsx`** —
  pure, no Next.
- **Most tests.** `apps/app` already runs vitest through `@vitejs/plugin-react`
  in jsdom. `navigation.test.ts`, `phone-*.test.ts`, and the settlement tests are
  pure logic. Component tests need a router provider instead of Next mocks.

### What does not port

- **`@repo/auth`** — next-auth v5, 8 Next-coupled files. Replaced, not ported.
- **`lib/backend.ts`** — the `server-only` BFF. Becomes a browser fetch client
  with a bearer token, and stops choosing the tenant (the token does).
- **The 31 server components** — data fetching moves into the client.
- **SSR first paint.** `members/page.tsx` fetches server-side deliberately, "so
  the table arrives with the document instead of flashing empty". That goes away;
  see Risk 4.

## Target — decided 2026-07-28

**Vite + React 19 + React Router 7 + TanStack Query. A plain SPA, no SSR.**

Justification for *this* app specifically:

- Every page is behind a login, so SEO and first-paint SEO cost are irrelevant.
- It runs on a front-desk terminal on a LAN, not a phone on 3G. SSR's latency
  win is close to zero here.
- It deletes an entire deployable Node service. One backend, one static bundle.
- It is the natural substrate for the deferred Electron/Face-ID terminal work.

The alternative — a Vite-based *framework* (React Router 7 framework mode or
TanStack Start) — would preserve SSR and give a near 1:1 mapping from server
components → loaders and server actions → actions, for materially less porting
work. It was **considered and rejected**: it keeps a Node server in the
deployment, which is most of what this migration exists to shed. Revisit only if
SSR becomes a hard requirement.

## Strategy: two apps side by side

`apps/web` is built as a **new, additional workspace**. `apps/app` keeps running,
untouched and deployable, for the entire migration. They run at the same time on
different ports and both talk to the same backend. Nothing is deleted until the
SPA has replaced it in production (Phase 5).

There is no freeze, no big-bang cutover, and at every point there is a working
app to fall back to and to compare behaviour against.

### What actually depends on what

Only **one** hard dependency edge exists in this plan:

```
Phase 0 (git) ─┬─> Phase 2 (scaffold apps/web) ──> Phase 3 (SPA auth) ─┐
               │                                                      ├─> Phase 4 (verticals) ──> Phase 5 (delete apps/app)
               └─> Phase 1 (backend requireUser) ─────────────────────┘
```

- **Phase 1 and Phase 2 are independent.** Do them in either order, or at once.
- **Phase 3 mostly works today** — `/auth/login`, `/auth/refresh` and `/auth/me`
  already exist and already mint real JWTs. It only needs Phase 1 for logout
  revocation and login rate limiting.
- **Phase 4 hard-depends on Phase 1.** This is the non-negotiable edge: a browser
  cannot call a `requireService` endpoint without holding `SERVICE_TOKEN`, and
  putting that token in a browser grants read/write access to *every gym*. The
  verticals cannot land before the backend accepts per-user tokens.

So: start with the scaffold if that is more motivating. Just do not let Phase 4
overtake Phase 1.

## Phases

Numbered by dependency, not by calendar order — see the graph above.

### Phase 0 — Put this repo in git first

`CLAUDE.md`: *"This repo is not a git repository. There is no `.git` — deletions
and overwrites are unrecoverable."*

Do not start a migration of this size without version control. `git init` and an
initial commit is the first task, full stop.

### Phase 1 — Backend: per-user auth (ships while Next is still live)

**Done.** Shipped as `requireCaller` (`src/middleware/caller.ts`) rather than the
`requireUser` this plan first named, because the dual-accept composite and the
bearer path turned out to be the same middleware. `requireAuth` now sets
`gymId`/`workerId` from the signed claims, so all ~111 `c.get("gymId")` call
sites and every handler body were left untouched — only the ~21 middleware
attachment points across 9 route files changed. `apps/app` still works through
the service door, unchanged.

Also landed: `POST /auth/logout`, refresh-token rotation with a Redis denylist,
and per-phone throttling on `/auth/login`. Covered by
`__tests__/caller-auth.test.ts` and `__tests__/token-revocation.test.ts`.

One real bug surfaced while testing rotation: refresh tokens signed only
`{ sub, iat, exp }`, and those are whole seconds — so rotating twice inside one
second returned a **byte-identical token that had just been revoked**, signing
the user out on their next refresh. Fixed by giving refresh tokens a `jti`.

The whole risk of the project is concentrated here, and none of it touches the
frontend.

What already exists and needs nothing: `POST /auth/login` (mints the access +
refresh pair), `/auth/refresh`, `/auth/me`, `requireAuth`, and CORS with
`credentials: true` and `Authorization` allowed. The SPA's auth story is already
built on the backend — it just isn't wired to the feature routes.

1. **Add `requireUser`** — verify the bearer token, then set *the same context
   keys `requireService` sets*:

   ```ts
   c.set("user", user);
   c.set("gymId", user.gymId);      // from the signed claim, never a header
   c.set("workerId", user.id);
   ```

   This is the move that makes the phase tractable: all ~111 `c.get("gymId")`
   call sites and every handler body stay **untouched**. Only the ~21 middleware
   attachment points change.

2. **Accept both callers during the transition.** A composite that tries
   `requireUser`, falls back to `requireService`. `apps/app` keeps working
   unchanged while `apps/web` comes up.

3. **`requireUser` must ignore `x-gym-id` entirely.** While both middlewares
   coexist this is the one place a tenant-crossing bug can hide.

4. **Add `POST /auth/logout`** with a refresh-token denylist in Redis (already a
   dependency). There is currently no way to invalidate a session.

5. **Decide token storage.** Recommended: access token in memory, refresh token
   in an httpOnly `SameSite=Lax` cookie. CORS already sends credentials.

6. **Add `x-service-token`-free rate limiting on `/auth/login`.** Once the API is
   browser-reachable, it is brute-forceable.

Verify with the curl matrix in `.claude/rules/integration-tests.md`, extended:
every feature endpoint must return 200 with a bearer token and 401 without one.

### Phase 2 — Scaffold `apps/web` alongside `apps/app`

New workspace; both run at once on different ports. Nothing is deleted yet.
Depends on nothing — this can be the first thing built.

Done. `apps/app` on :3000, `apps/web` on :3001. `pnpm --filter web dev`.
One gotcha worth keeping: `vite.config.ts` must alias `@repo/*` by path.
The design system's files import each other by package name but the package
has no dependency on itself, so pnpm never self-links it — dev resolves it
from the app's `node_modules` regardless, and only the production build fails.

- Vite, React 19, React Router 7, TanStack Query, Tailwind v4 via
  `@tailwindcss/vite` (not the postcss plugin).
- Wire `@repo/design-system` in and prove one page renders with correct theming.
  Keep `attribute="class"` on next-themes — `globals.css` uses
  `@custom-variant dark (&:is(.dark *))` and the default `data-theme` silently
  styles nothing.
- Port the shell: sidebar, topbar, branch switcher, theme + language switchers.
- i18n: `lib/i18n/dictionary.ts` is a plain object and moves as-is. `getLocale()`
  moves from a server cookie read to a client read at boot.

### Phase 3 — Auth in the SPA

**Done.** Router is **TanStack Router** (file-based, `autoCodeSplitting`), not
React Router — swapped during this phase while it cost three files.

Token handling: **refresh token in an httpOnly cookie, access token in memory.**
`/auth/login` takes `mode: "cookie"`, sets the cookie and omits `refreshToken`
from the body; page scripts can therefore never read the long-lived token, and an
XSS buys minutes rather than a month. A reload loses the in-memory half, so
`main.tsx` calls `/auth/refresh` before the first render.

Two things that are load-bearing rather than tidy:

- **Refresh is single-flight.** The backend rotates refresh tokens, so two
  concurrent refreshes would race — the first rotates, the second presents a
  revoked token and signs the operator out. A dashboard 401ing several queries
  at once is the normal case. Covered by `__tests__/api-refresh.test.ts`.
- **The query cache is persisted and busted per user.** A front desk is a shared
  machine; the next operator must not paint from the previous one's cache.
  `purgeCache()` runs on sign-in, sign-out, and on any failed refresh.



- New `@repo/auth-client`: `login()`, `logout()`, `refresh()`, a fetch wrapper
  that retries once on 401 after refreshing, and an auth context.
- Route guards replace `packages/auth/config.ts` → `authorized`. Preserve all
  three tiers and the redirect matrix, including `callbackUrl` same-origin
  validation (`safeDestination`) — that is a real open-redirect guard, not
  boilerplate.
- Keep `phone-field.tsx`, `countries.ts`, `flag-icon.tsx` verbatim. Flags stay
  inline SVG; Windows has no country-flag glyphs.
- `POST /api/register` (the one Next route handler) moves to the backend's
  existing `/auth/register`.

### Phase 4 — Port feature verticals one at a time

The translation is highly regular. Per vertical:

| Next | Vite |
|---|---|
| `page.tsx` server fetch | route + `useQuery` (or a router loader) |
| `actions.ts` (`"use server"`) | `api/*.ts` client fns + `useMutation` |
| `revalidatePath("/members")` | `invalidateQueries({ queryKey: ["members"] })` |
| `*-view.tsx`, sheets, dialogs | unchanged but for imports |

`revalidatePath` → `invalidateQueries` is a genuine 1:1; the 10 files using it
translate directly.

Suggested order — smallest complete vertical first to validate the pattern, then
by size:

1. `plans` (9 endpoints) — the pattern proof
2. `transactions` (6)
3. `members` (12)
4. `orders` (6)
5. `products` / `catalog` / `combos` (12)
6. `inventory` / `suppliers` (10)
7. `workers` (16)
8. `attendance`
9. `devices` (19) — largest, and coupled to the Face-ID/ISAPI work; do it last

### Phase 5 — Cutover and delete

1. Point the front-desk terminal at the Vite build.
2. Remove the `requireService` fallback; delete the middleware and
   `SERVICE_TOKEN` from both `.env.local` files.
3. Delete `apps/app`, the next-auth surface of `@repo/auth`, `@repo/next-config`,
   `@repo/seo`.

Only after the SPA has run in production for a bit. Deleting `apps/app` is
irreversible without git — another reason Phase 0 is Phase 0.

## Risks

1. **Phase 4 must not overtake Phase 1.** Porting a feature vertical before the
   backend accepts per-user tokens means either exposing `SERVICE_TOKEN` to the
   browser — which lets anyone read and write *any gym's* data — or not shipping.
   There is no middle option. Everything else in the plan is reorderable; this
   is not.
2. **Tenant leakage during the dual-middleware window.** Cover it with a test
   that sends a valid bearer token *and* a hostile `x-gym-id` and asserts the
   header is ignored.
3. **No git.** Phase 0.
4. **First paint regresses.** Pages that arrive populated will flash a skeleton.
   Mitigate with router loaders that start the fetch during navigation rather
   than on mount, and prefetch on sidebar hover. Accept it for the rest.
5. **`SERVICE_TOKEN` write attribution.** `x-worker-id` currently populates
   `created_by`. Under `requireUser` that comes from the token claim — stronger,
   but confirm no route depends on the Next server overriding it.
6. **Scope creep into the design system.** It ports nearly free. Resist
   "while we're in here" rewrites; that is how a 3-week migration becomes 3
   months.

## Rough effort

| Phase | Estimate |
|---|---|
| 0 — git | < 1 hour |
| 1 — backend auth | 1–2 days |
| 2 — scaffold | 1 day |
| 3 — SPA auth | 1–2 days |
| 4 — 9 verticals | 5–9 days |
| 5 — cutover | 1 day |

**~2–3 weeks of focused work**, sequenceable, with a working app throughout.
