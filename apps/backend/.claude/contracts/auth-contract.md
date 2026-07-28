---
paths:
  - "apps/backend/src/services/auth.service.ts"
  - "apps/backend/src/lib/password.ts"
  - "apps/backend/src/lib/jwt.ts"
  - "apps/backend/src/lib/phone.ts"
  - "apps/backend/src/middleware/auth.ts"
  - "packages/auth/**"
owner: "backend"
updated_at: "2026-07-21"
---

# Auth Contract

Identity is a phone number, and the account behind it is a row in **`workers`**.
There are no emails and no usernames. (`workers.login` exists in SQL and is kept
in step with `phone`, but nothing authenticates against it today.)

Two conditions beyond the password must hold, or the login is refused with the
same generic 401:

- `status = 'active'` — a suspended or ex-employee row cannot sign in.
- `gym_id` is present — a worker with no tenant cannot be scoped to one, and
  every query downstream is required to filter by `gym_id`.

Phone is **not** unique in SQL (it is only indexed per gym). If two *active*
workers share a number, `findActiveWorkerByPhone` refuses to guess and the login
fails. `register()` is what prevents that from arising.

## Two Sessions, One Password

The same credentials mint two different things, and confusing them causes real
bugs:

- **Web (`apps/app`)** — Auth.js owns the session. It calls `POST /auth/verify`,
  gets the safe user shape, and signs its **own** JWT with `AUTH_SECRET`. The
  token this backend can issue is **not used** on the Next web session.
- **`apps/web`, API and mobile clients** — `POST /auth/login` returns this
  backend's own pair, signed with `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` and
  checked by `requireAuth`. The access token carries `gymId` and `branchId`, so
  a request never re-derives its tenant and cannot be asked to assume another.

`apps/app` is being replaced by `apps/web`, which uses the second of these
directly from the browser. Until it is gone, both work — see "Who May Call a
Feature Route" in `api-contract.md`.

## Refresh Tokens

- **They rotate.** `/auth/refresh` revokes the token it was handed before
  issuing the next pair, so a replay is a 401 rather than a second live session.
- **Revocation is a Redis denylist** (`lib/token-denylist.ts`), keyed by
  SHA-256 of the token and expiring exactly when the token would have. Tokens
  are never stored whole: a dump of Redis must not hand out credentials.
- **The denylist fails open.** An unreachable Redis answers "not revoked",
  because the alternative signs out every operator at once mid-shift. The
  exposure is bounded — access tokens last minutes — and it matches `index.ts`
  already treating Redis as non-fatal.
- **Refresh tokens carry a `jti`**, and must keep doing so. Without it the
  payload is `{ sub, iat, exp }` at one-second resolution, and two refreshes
  inside the same second mint a byte-identical token that rotation has just
  revoked.
- **`refreshSession` re-reads the worker.** A refresh token outlives an access
  token, so the account may have been renamed, moved, demoted or deactivated.

`AUTH_SECRET` (web) and `JWT_ACCESS_SECRET` (API) are unrelated secrets. Neither
side can verify the other's token, and neither should try to.

## Phone Numbers

People type `+998 90 766 17 70`, `998907661770`, and `998-90-766-17-70`. Stored
and compared as **bare digits**, always:

```ts
export const normalizePhone = (phone: string) => phone.replace(/\D/g, "");
```

- `lib/phone.ts` and `packages/auth/lib/phone.ts` must stay **byte-identical**.
  They are two copies of one rule; a divergence means the web app looks up a
  string that this database can never contain, and *every* login fails with
  "invalid credentials" and a clean 401 in the logs.
- Normalization lives in `phoneSchema` (`src/schemas/auth.ts`) as a Zod
  `.transform()`, so any validated route gets digits for free. This is why
  handlers must read `c.req.valid("json")` and never `c.req.json()`.
- The backend checks length *after* normalizing: 9–15 digits. It stays
  deliberately permissive, because the country list is a **product** decision,
  not a storage one.
- The web app is stricter: `packages/auth/lib/countries.ts` offers Uzbekistan,
  Kazakhstan, Kyrgyzstan, Tajikistan, Turkmenistan and Russia, and validates the
  exact digit count for the chosen country. Kazakhstan and Russia share `+7`, so
  that list is keyed by **ISO code**, never by dial code.
- `PhoneField` submits one assembled bare-digit value, so forms still read a
  single `phone` field off `FormData`.

## Passwords

- bcrypt, cost from `BCRYPT_ROUNDS` (10–15, default 12). ~250ms per hash: slow
  enough to make offline cracking expensive, fast enough for a login round-trip.
- Minimum 4 characters, **maximum 72** — bcrypt silently truncates past 72
  bytes, so the schema rejects rather than misleads.
- Only `lib/password.ts` calls bcrypt. Compare with `verifyPassword`, never
  `===`.
- A hash never leaves a service: `toAuthUser()` strips `passwordHash`. Returning
  a raw `Worker` row from a route is a leak.

## Credential Failures Are Uniform

`verifyCredentials` returns the user or `null`. It never explains itself, and
callers cannot tell "no such phone" from "wrong password" — **including by
timing**:

```ts
if (!user) {
  await hashPassword(password); // deliberate: pay the same cost as the found path
  return null;
}
```

Do not "optimize" that branch away. Without it, response latency tells an
attacker which phone numbers have accounts.

The same rule holds at the edges: one message (`"Invalid phone number or
password"`), one status (401), whichever half was wrong.

## Registration Onboards A Tenant

`POST /auth/register` does not create a person — it creates a **gym, a branch and
an owner** in one transaction. A gym with no branch and no owner is unusable, so
the three rows are written together or not at all.

- **409** if the phone already belongs to any worker. This is the only auth
  failure a user can usefully act on.
- Enumeration note: registration necessarily reveals that a phone is taken. That
  is accepted. Login must not.
- IDs are `nanoid(20)`, generated in the service — never client-supplied.
  `nanoid(21)` does not fit `varchar(20)`.
- `gymName` is optional; the service derives `"<name>'s Gym"` when the sign-up
  form does not collect one.
- `role` is forced to `owner` and is **never** settable from a request body.

`WORKER_ROLES` is `owner | admin | manager | trainer | receptionist`. SQL types
the column as a free-form `varchar(32)`, so the set is enforced in TypeScript;
an unrecognised value read back from the database degrades to the
least-privileged role rather than being trusted.

## Protected Routes

`requireAuth` verifies the API JWT and puts the user on the context. Read it
with `c.get("user")` — never re-query, and never trust an id from the body or a
query param for identity.

## Changing Any of This

Auth spans two workspaces. A change to the credential path is only complete when
both are updated together:

- `apps/backend/src/services/auth.service.ts` + `src/routes/auth.ts`
- `packages/auth/lib/verify-credentials.ts` + `packages/auth/lib/register-user.ts`

See `api-contract.md` for why `/auth/verify`'s status codes are load-bearing.
