# Integration Testing

There is no separate integration-test runner in this repo. "Integration" here means **driving the running system end to end** — the Hono backend against real MySQL, and the Next app against the real backend — rather than a mocked harness.

Unit tests (`pnpm --filter <pkg> test`) never touch infrastructure: the MySQL pool and Redis client are lazy, and `vitest.config.mts` feeds `src/env.ts` throwaway values.

## Verifying the backend end to end

The backend runs on **:7090**. `DB_HOST` is a **remote MySQL server with real data** — read freely, but confirm with the user before anything that writes.

```bash
# liveness (no dependencies) and readiness (MySQL + Redis)
curl -s localhost:7090/health
curl -s localhost:7090/health/ready      # {"status":"ok","database":"up","cache":"up"}

# credential check — the endpoint packages/auth calls
curl -s -X POST localhost:7090/auth/verify \
  -H "Content-Type: application/json" \
  -d '{"phone":"998907661770","password":"1111"}'
```

What each result should be:

| Case | Expected |
|---|---|
| `/auth/verify` correct | `200` `{ id, phone, name, role, gymId, branchId }` |
| `/auth/verify` wrong password | `401` `{ error: { code: "invalid_credentials" } }` |
| `/auth/register` duplicate phone | `409` conflict |
| `/auth/refresh` with an **access** token | `401` — the secrets are split; an access token must never work as a refresh token |
| `/auth/refresh` replaying an already-refreshed token | `401` — refresh tokens rotate and the old one is spent |
| `/auth/logout` with any input, valid or garbage | `204` — never an oracle for which tokens are real |
| `/auth/me` without a bearer token | `401` |
| 11 failed `/auth/login` for one phone | `429` with `details.retryAfter` |

### The two front doors

Feature routes accept a per-user bearer token *or* the legacy service token.
Both must behave, and the tenant must come from the right place:

```bash
# browser-style: the tenant is a signed claim
token=$(curl -s -X POST localhost:7090/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"998907661770","password":"1111"}' \
  | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')

curl -s localhost:7090/categories -H "Authorization: Bearer $token"

# the same request with a hostile tenant header — must be IGNORED, not honoured
curl -s localhost:7090/categories \
  -H "Authorization: Bearer $token" -H "x-gym-id: someone-elses-gym"
```

| Case | Expected |
|---|---|
| feature route, valid bearer token | `200`, scoped to the token's `gymId` |
| feature route, valid bearer **+ hostile `x-gym-id`** | `200`, still the token's gym — the header is inert |
| feature route, **invalid** bearer + valid `x-service-token` | `401` — a bad token must not fall back to service trust |
| feature route, `x-service-token` + `x-gym-id` | `200` — **nothing legitimate uses this any more**; see the note below |
| feature route, no credentials at all | `401` |

These are covered offline by `apps/backend/__tests__/caller-auth.test.ts`, which
needs no server and no database — run that first; the curl matrix only adds
confidence that real credentials and a real DB behave the same.

### `x-service-token` is now an open door with nobody behind it

`requireService` exists because `apps/app` called this API server-to-server on
behalf of an already-authenticated user: a shared secret plus a **client-supplied
`x-gym-id`**. That is only safe with a trusted server in front deciding the gym.

**`apps/app` was deleted on 2026-07-29 and nothing uses this path any more.**
Until it is removed, anyone holding `SERVICE_TOKEN` can read or write *any*
tenant by setting a header. Retiring it means dropping `requireService` from
`middleware/caller.ts`, deleting `middleware/service.ts` and `SERVICE_TOKEN`
from `env.ts`, and updating `caller-auth.test.ts`.

## Verifying web auth end to end

The SPA runs on **:3001**. There is no CSRF dance and no server session —
`apps/web` calls the backend directly, so a scripted login is one request:

```bash
curl -s -c jar.txt -X POST localhost:7090/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"998907661770","password":"1111","mode":"cookie"}'
```

`mode: "cookie"` is what the browser sends: the access token comes back in the
JSON body and the refresh token in an **httpOnly cookie** (in `jar.txt`), which
is why the access token can be kept in memory only. The `id` in the body is the
**nanoid from MySQL** — anything else means the login is not reaching the DB.

Then check the cookie alone can re-mint a session, which is what a page reload
does:

```bash
curl -s -b jar.txt -X POST localhost:7090/auth/refresh
```

## Redirect matrix worth re-checking after touching `_authed`

Enforced client-side by the `_authed` layout route, so these are browser
navigations rather than HTTP status codes — there is no server to answer them.

| Request | Expected |
|---|---|
| signed out → `/members` | redirected to `/sign-in?callbackUrl=…` |
| signed out → `/sign-in` | form renders |
| signed in → `/sign-in` | redirected to `/` |
| signed in → `/sign-in?callbackUrl=/members` | lands on `/members` |
| signed in → `/sign-in?callbackUrl=https://evil.com` | lands on `/` (**never** off-origin) |
