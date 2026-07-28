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
| `/auth/verify` correct | `200` `{ id, phone, name }` |
| `/auth/verify` wrong password | `401` `{ error: { code: "invalid_credentials" } }` |
| `/auth/register` duplicate phone | `409` conflict |
| `/auth/refresh` with an **access** token | `401` — the secrets are split; an access token must never work as a refresh token |
| `/auth/me` without a bearer token | `401` |

## Verifying web auth end to end

The app runs on **:3000**. Auth.js requires a CSRF token, so a scripted login is two steps:

```bash
csrf=$(curl -s -c jar.txt localhost:3000/api/auth/csrf | sed -n 's/.*"csrfToken":"\([^"]*\)".*/\1/p')

curl -s -b jar.txt -c jar.txt -o /dev/null -w "%{http_code} %{redirect_url}\n" \
  -X POST localhost:3000/api/auth/callback/credentials \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "csrfToken=$csrf" \
  --data-urlencode "phone=998907661770" --data-urlencode "password=1111"

curl -s -b jar.txt localhost:3000/api/auth/session
```

A successful login is `302 → /` with an `authjs.session-token` cookie, and the session's `user.id` is the **nanoid from MySQL** — if it is anything else, the credentials provider is not actually reaching the backend.

## Redirect matrix worth re-checking after touching `authorized`

| Request | Expected |
|---|---|
| signed out → `/search` | `307` → `/sign-in?callbackUrl=…` |
| signed out → `/sign-in` | `200`, form renders |
| signed in → `/sign-in` | `302` → `/` |
| signed in → `/sign-in?callbackUrl=/search` | `302` → `/search` |
| signed in → `/sign-in?callbackUrl=https://evil.com` | `302` → `/` (**never** off-origin) |
