# Domain Concepts

> **Status: scaffold.** This file previously held another product's domain dictionary (a "knowledge graph" of Signals, Insights, Studies) and has been replaced. It now contains only concepts that exist in this codebase. Grow it as the domain grows.

## Gym — the tenant boundary

The unit of isolation. Everything belongs to exactly one gym, and **every query
must filter by `gym_id`**; the database declares no foreign keys and will not
enforce it for you. A gym owns branches, and gym-level records (members, plans,
products, workers) are shared across all of them.

## Branch — a location

One physical site within a gym. Branch-level records (halls, devices, orders,
income, expenses, attendance) belong to one branch. A worker's `branch_id` is
**nullable**: gym-level staff such as an owner are not tied to a location.

## Worker — a staff account

The only thing that can sign in. Lives in `workers` (MySQL, database `gyms`).

| Field | Notes |
|---|---|
| `workerId` | `nanoid(20)`, minted in the service layer — not auto-increment, not a DB default. `varchar(20)`, so **not** `nanoid(21)` |
| `gymId` | The tenant. A worker without one cannot sign in |
| `branchId` | Nullable — gym-level staff have none |
| `phone` | **The login identifier.** Bare digits (`998907661770`), never formatted. Indexed per gym but **not unique in SQL** — uniqueness is enforced in `register()` |
| `fullname` | Display name |
| `passwordHash` | bcrypt (60 chars, in a `varchar(255)` column). **Never leaves the service layer** |
| `role` | see below |
| `status` | Only `active` may authenticate |

## Member — not a worker

A gym's customer, in `members`. Distinct from `workers`, has **no password
column**, and cannot sign in. Do not conflate the two: "user" is ambiguous in
this codebase and is best avoided as a term.

## Role

`workers.role` is a free-form `varchar(32)` in SQL; the allowed set lives in
`WORKER_ROLES` (`db/schema.ts`) and is enforced in TypeScript.

| Role | Meaning today |
|---|---|
| `owner` | What registration grants — the person who created the gym |
| `admin` | In the set; no behaviour attached yet |
| `manager` | In the set; no behaviour attached yet |
| `trainer` | In the set; no behaviour attached yet |
| `receptionist` | Least privileged. An unrecognised role read from the database degrades to this rather than being trusted |

Enforced by `requireRole(...)` in `apps/backend/src/middleware/auth.ts`. Nothing
currently gates on a specific role — they exist ahead of the features.

## Session vs. Token — not the same thing

Easy to conflate, and conflating them will produce a broken auth change:

- **Web session** — a next-auth JWT cookie (`authjs.session-token`), minted by `packages/auth` *after* the backend confirms the credentials. This is what a browser carries.
- **API tokens** — an `accessToken` / `refreshToken` pair minted by the backend and signed with **two different secrets**, so an access token can never be replayed as a refresh token. These are for API clients (e.g. a future mobile app), *not* for the web session.

`POST /auth/verify` deliberately returns **no token** — only `{ id, phone, name }` — because next-auth mints its own session from it. Changing that response shape breaks web login.

## Normalized phone

Phone numbers arrive in whatever shape a human typed them. `normalizePhone` strips every non-digit. It exists in **both** `packages/auth/lib/phone.ts` and `apps/backend/src/lib/phone.ts`, and the two **must stay identical** — if they diverge, every login fails silently.
