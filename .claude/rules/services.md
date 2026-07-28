---
paths: apps/backend/src/services/**
---

# Service Layer Rules

Services hold the business logic. They are the **only** layer allowed to touch the database.

## Invariants

- **Services never see HTTP.** No `Context`, no `c.req`, no status codes. They take plain arguments and return plain data or throw an `AppError`.
- **Never return a row straight out.** Map it to a safe shape first — a `User` row carries `passwordHash`, and an `AuthUser` must not.
- **Ids are minted here**: `nanoid(20)` (`ID_LENGTH` from `db/schema.ts`), not by the database. FITZLY's id columns are `VARCHAR(20)` — `nanoid(21)` does not fit.
- **Throw, don't return null, for exceptional cases** — `ConflictError` on a duplicate, `NotFoundError` on a missing row. Reserve `null` for "this is an ordinary, expected miss" (as `verifyCredentials` does for bad credentials).
- **Don't leak enumeration through timing.** `verifyCredentials` hashes the supplied password even when no user exists, so a missing account takes as long as a wrong password. Preserve that property in any similar lookup.
- **Re-read the user on privilege-bearing operations.** A refresh token outlives an access token, so `refreshSession` re-reads the row rather than trusting claims — the account may have been renamed, demoted, or deleted since issue.
- **Relative imports end in `.js`.**

## Reference

`apps/backend/src/services/auth.service.ts` — registration, login, credential verification, refresh.
