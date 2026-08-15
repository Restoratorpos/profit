---
paths:
  - "apps/backend/src/routes/**"
  - "apps/backend/src/schemas/**"
  - "apps/backend/src/middleware/error-handler.ts"
owner: "backend"
updated_at: "2026-07-14"
---

# API Contract

The HTTP surface. Consumers are `apps/app` (via `packages/auth`) and, later,
mobile clients — so response shapes here are public API, not implementation
detail.

## Router Composition

Routers are Hono instances mounted in `src/routes/index.ts`:

```ts
export const routes = new Hono<AppEnv>()
  .route("/health", healthRoutes)
  .route("/auth", authRoutes);
```

A route handler does exactly three things: validate input, call a service, shape
the response. Business logic in a handler is a bug — move it to `src/services/`.

## Validation

Every body-taking route validates with `zValidator("json", schema)` and a schema
from `src/schemas/`. Read the parsed value back with `c.req.valid("json")` —
never `await c.req.json()`, which skips the transforms (phone normalization
happens *inside* the schema).

A validation failure returns **400** automatically. Do not hand-roll one.

## Response Shapes

Success returns the resource directly — no envelope, no `{ data: ... }` wrapper.

Errors always return this shape, produced by `middleware/error-handler.ts`:

```jsonc
{ "error": { "code": "invalid_credentials", "message": "Invalid phone number or password" } }
```

- `code` is a stable, machine-readable slug. Clients branch on it; treat a
  rename as a breaking change.
- `message` is human-readable and safe to show a user.

Never build an error response by hand in a route. Throw an `AppError` subclass
from `lib/errors.ts` (`BadRequestError`, `UnauthorizedError`, `ForbiddenError`,
`NotFoundError`, `ConflictError`) and let the handler render it. Anything that
is *not* an `AppError` is treated as a bug: it becomes a 500 and its internals
are never leaked to the client.

## Auth Routes

| Route | Purpose | Success |
| --- | --- | --- |
| `POST /auth/register` | Onboard a tenant (gym + branch + owner) | `201 { user, accessToken, refreshToken }` |
| `POST /auth/login` | Token login (apps/web, mobile, API clients) | `200 { user, accessToken, refreshToken }` |
| `POST /auth/refresh` | Rotate a refresh token | `200 { user, accessToken, refreshToken }` |
| `POST /auth/logout` | Revoke a refresh token | `204`, always |
| `POST /auth/verify` | **Web login.** Server-to-server credential check | `200 { id, phone, name, role, gymId, branchId }` |
| `GET /auth/me` | Current user, behind `requireAuth` | `200 { user }` |
| `PATCH /auth/password` | Change **your own** password, behind `requireAuth` | `204` |

`PATCH /auth/password` re-checks the current password against the stored hash
rather than trusting the bearer token, and answers a wrong one with **403, not
401** — the SPA reads 401 as "this access token expired", so it would refresh,
rotate the session's refresh token and replay the same doomed request before
showing the message.

`POST /auth/login` is throttled per phone number — **429** with
`details.retryAfter` in seconds once the window is exhausted. The counter is
cleared by a successful sign-in, so fumbling a password costs nothing once you
get it right.

### Refresh tokens rotate, and rotation is enforced

`/auth/refresh` **spends** the token it is given: the presented token is revoked
and a new pair issued. Replaying an already-refreshed token is a 401, which is
what makes a stolen refresh token detectable rather than a silent second
session.

Two consequences worth knowing:

- Refresh tokens carry a `jti`. Without it the payload is only
  `{ sub, iat, exp }` at one-second resolution, so two refreshes in the same
  second produced a **byte-identical** token — one that rotation had just
  revoked.
- A revoked token and a forged one return the identical 401 body. Do not add a
  distinguishing message; it would be an oracle for guessing valid tokens.

`/auth/logout` answers `204` for every input, including garbage, for the same
reason.

### Browsers ask for a cookie; everyone else keeps the token

`/auth/login` and `/auth/register` take `mode: "token" | "cookie"`, defaulting to
`token` so existing API and mobile clients are untouched.

| mode | refresh token delivered as | in the body? |
| --- | --- | --- |
| `token` (default) | `refreshToken` in the JSON | yes |
| `cookie` | `Set-Cookie: profit_refresh=…; HttpOnly; SameSite=Lax` | **no** |

Never return both — the entire reason a browser asks for the cookie is that its
own scripts must not be able to read the long-lived token.

`/auth/refresh` and `/auth/logout` read the cookie when it is present and answer
in kind, so a browser posts `{}` and never handles the token at all. A request
carrying neither cookie nor body token gets **401 "Not signed in"**, not 400:
the SPA calls this on every cold load to discover whether it has a session, so
that is the ordinary answer for a signed-out visitor rather than a client error.

Two deployment constraints follow from `SameSite=Lax`:

- The SPA must be served from **the same origin as the API** (via the Vite proxy
  in development). `Lax` is what blocks CSRF against `/auth/refresh`; going
  cross-origin would need `SameSite=None; Secure`, and therefore HTTPS, which the
  front-desk terminal does not have.
- The cookie is `Path=/`, not `/auth`. In development the browser sees
  `/api/auth/*` while this server sees `/auth/*`, so a narrower path would be set
  and then never sent back.

### `/auth/verify` is load-bearing — do not change its shape

`packages/auth` (Auth.js credentials provider) calls this from the Next.js
server on every web sign-in. It mints its **own** session JWT, so this endpoint
deliberately issues **no token**. It returns the safe user shape on success and
**401** on bad credentials.

Auth.js maps that 401 to "invalid credentials" and anything else to a thrown
error. So:

- Bad password → **401**. Never 200-with-null, never 400.
- Backend broken → **5xx**. A failing backend must not be indistinguishable from
  a wrong password, or an outage reads to every user as "my password stopped
  working" and nothing in the logs says otherwise.

Changing the status codes or the response keys here breaks web login silently.
The caller is `packages/auth/lib/verify-credentials.ts` — change both together.

## Registration Reaches This API Through the Web App

The browser never calls this API directly: `AUTH_BACKEND_URL` is server-only.
`apps/app/app/api/register/route.ts` proxies same-origin, which is why there is
no CORS surface for it. `POST /auth/register` returns **409** on a duplicate
phone; that is the only failure a user can act on, and the web layer is the only
thing that should translate it into a message.

## CORS

`CORS_ORIGINS` is a comma-separated allowlist (`config.cors.origins`). It only
governs *browser* callers. `/auth/verify` and `/auth/register` arrive
server-to-server from Next.js and are unaffected by it — do not "fix" a login
failure by loosening CORS.

## Who May Call a Feature Route

Every feature router mounts **`requireCaller`** (`src/middleware/caller.ts`),
which accepts either kind of caller and leaves the context identical:

| Caller | Presents | `gymId` comes from |
| --- | --- | --- |
| `apps/web` (browser) | `Authorization: Bearer <access token>` | a **signed claim** |
| `apps/app` (Next server) | `x-service-token` + `x-gym-id` | a **request header** |

A bearer token wins when one is present, and an *invalid* bearer token is
rejected rather than falling through to the service check — otherwise a browser
with an expired session could be silently upgraded to service-level trust by a
header a proxy added.

Under a bearer token `x-gym-id` is **never read**. That is the whole point: the
service door lets whoever holds `SERVICE_TOKEN` name any gym, and the bearer
door cannot. `__tests__/caller-auth.test.ts` asserts it; if that test ever fails,
one gym can read another's data by editing a request.

### The exception: `/gym`

The settings routers mount **`requireAuth`**, not `requireCaller`:

| Route | Purpose | Success |
| --- | --- | --- |
| `GET /gym` | The tenant's name, plan and opening hours | `200 GymSettingsView` |
| `PATCH /gym` | Rename it or set its hours — `requireRole("owner", "admin")` | `200 GymSettingsView` |

The service door takes its tenant from a client-supplied header, and "which gym
am I renaming" is precisely the question that must not be answerable that way.
Reading is open to any signed-in worker because the shell puts the gym's name in
the header of every screen. Hours live on `branches`, so the service resolves the
caller's branch (falling back to the gym's oldest — an owner has no `branchId`).
`__tests__/gym-settings.test.ts` covers the matrix.

`requireService` is being retired. Once `apps/app` is gone (Phase 5 of
`MIGRATION-VITE.md`) the routes go back to plain `requireAuth`, and
`SERVICE_TOKEN` comes out of both environments.

## Adding a Route

1. Zod schema in `src/schemas/`.
2. Service function in `src/services/` — pure logic, no `Context`.
3. Thin handler in `src/routes/`, wired with `zValidator`.
4. Protected? Add `requireCaller` and read the tenant with `c.get("gymId")`.
   Use `requireAuth` directly only where a *person* is required rather than a
   tenant (`/auth/me`), since the service door has no user to offer.
5. Test with `app.request()` in `__tests__/` — asserts the contract, needs no port.
