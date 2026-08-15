# Vision

> **Status: scaffold.** This file previously described a different product entirely (Psyro, "an AI-powered market research copilot") and has been replaced. What follows is only what the codebase actually demonstrates. The "Open questions" are genuinely unknown — get them from the product owner rather than inferring from code.

## What exists today

GYM is the application layer over **FITZLY**, a multi-tenant gym CRM:

- A **React + Vite SPA** (`apps/web`, :3001) behind a session.
- A **Hono API** (`apps/backend`, :7090) that owns the `gyms` database in MySQL.
- Staff sign in with a **phone number and password** — not email. Phone numbers are stored and compared as bare digits; the UI offers Uzbekistan, Kazakhstan, Kyrgyzstan, Tajikistan, Turkmenistan and Russia, and accepts any human formatting (`+998 90 766 17 70` → `998907661770`).
- Accounts are rows in **`workers`**, carrying a role of `owner`, `admin`, `manager`, `trainer` or `receptionist`.
- Registration onboards a whole tenant: it creates a **gym, a branch and an owner** together.
- The signed-in area currently has a single page: **Dashboard**.

That is the entire *built* product surface. The database is far ahead of the code — see below.

## What the schema commits to but no code implements yet

`gyms.sql` defines 24 tables; `schema.ts` models 3. The remaining 21 describe a
product that does not exist in code yet, and they answer several questions that
used to be open here:

- **Multi-tenant, two levels deep**: `gyms > branches > everything`. Every query must filter by `gym_id`.
- **Members are distinct from workers** (`members`), with memberships, freezes, plans and halls.
- **There is a payments dimension**, and it is strictly **cash-basis**: `income` / `expenses` rows exist only when money actually moved, and debt is never stored — always computed.
- **There is retail and stock**: products, combos, suppliers, orders, and a single signed-quantity stock ledger.
- **There is attendance hardware**: `devices` and `credentials` (card / face / QR), feeding `attendance_events` and `attendance_sessions`.

Treat these as the intended direction, not as working features.

## Open questions — do not guess

- Which role is the primary day-to-day user: the **owner**, the **manager**, or the **receptionist** at the desk?
- Do **members** ever sign in themselves, or is this staff-only? (`members` has no password column, which suggests staff-only — but confirm.)
- Is self-serve gym registration intended, or should tenants be created by an operator? Sign-up currently creates a whole tenant.
- Is a mobile client planned? The phone-first login and the access/refresh token pair both hint at one.

## Principles the code already commits to

Inferred from how the system is built, and worth preserving:

- **The backend owns identity.** The web app never checks a password itself — it asks the backend (`POST /auth/verify`). Any future client (mobile, admin tool) gets the same contract for free.
- **Fail loudly, not silently.** A backend outage must never be indistinguishable from a wrong password.
- **Never leak account existence** — same response, and same timing, whether or not the phone is registered.
