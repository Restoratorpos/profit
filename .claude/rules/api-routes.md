---
paths: apps/backend/src/routes/**
---

# Hono Route Rules

## Required reading
- `apps/backend/src/routes/auth.ts` — the reference route
- `.claude/agents/api-route-scaffolder.md` — full anatomy

## Invariants

- **Routes do HTTP; services do logic.** A route must never import from `db/`. If a handler is querying Drizzle directly, that logic belongs in `services/`.
- **Every relative import ends in `.js`** (ESM + `NodeNext`), even though the file on disk is `.ts`.
- **Validate every body** with `zValidator("json", schema)` and read it back with `c.req.valid("json")`. Never `await c.req.json()` by hand.
- **Errors are thrown, not constructed.** Throw an `AppError` subclass from `lib/errors.ts`. Never build an error `Response` inline. Anything that is not an `AppError` is flattened to a 500 with no internals leaked — that is deliberate.
- **`requireRole(...)` comes after `requireAuth`** — it reads the user that `requireAuth` sets.
- **Auth failures are indistinguishable.** "No such phone" and "wrong password" return the same status and message.
- **Log via `c.get("logger")`**, never `console.*` — the request logger carries the request id.

## Response shapes

| Case | Body |
|---|---|
| Success | the resource; sessions return `{ user, accessToken, refreshToken }` |
| Created | same, status `201` |
| Any error | `{ error: { code, message, details? } }` |

## After changing a route

```bash
pnpm --filter backend typecheck && pnpm --filter backend test
```
