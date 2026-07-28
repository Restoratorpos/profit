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
| `POST /auth/register` | Create an account | `201 { user, token }` |
| `POST /auth/login` | Token login (mobile/API clients) | `200 { user, token }` |
| `POST /auth/verify` | **Web login.** Server-to-server credential check | `200 { id, phone, name }` |
| `GET /auth/me` | Current user, behind `requireAuth` | `200 { user }` |

### `/auth/verify` is load-bearing — do not change its shape

`packages/auth` (Auth.js credentials provider) calls this from the Next.js
server on every web sign-in. It mints its **own** session JWT, so this endpoint
deliberately issues **no token**. It returns a bare `{ id, phone, name }` on
success and **401** on bad credentials.

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

## Adding a Route

1. Zod schema in `src/schemas/`.
2. Service function in `src/services/` — pure logic, no `Context`.
3. Thin handler in `src/routes/`, wired with `zValidator`.
4. Protected? Add `requireAuth` and read the user with `c.get("user")`.
5. Test with `app.request()` in `__tests__/` — asserts the contract, needs no port.
