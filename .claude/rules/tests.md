---
paths: "**/*.test.*", "**/*.spec.*"
---

# Test Rules

## Invariants

- **Vitest**, not Jest. `pnpm --filter <pkg> test`.
- **Never use the `NODE_ENV=test cmd` shell prefix** in a test script. This repo is developed on Windows, where that is a parse error — and vitest already sets `NODE_ENV=test` itself.
- Use `async/await`, never done callbacks. No `.only` / `.skip` in committed code.
- Assertions go inside `it()` / `test()`. Keep suites flat.
- Test behaviour and outcomes, not implementation details.

## Backend (apps/backend)

Drive the Hono app directly — no port binding, no running server:

```ts
import { app } from "../src/app.js";

const response = await app.request("/health");
expect(response.status).toBe(200);
```

`src/env.ts` **exits the process** on an invalid environment, so tests need every required variable. They are supplied in `vitest.config.mts` under `test.env` and deliberately point at nothing real — both the MySQL pool and the Redis client are lazy, so importing the app dials out to nothing.

Never let a unit test hit the real database: `DB_HOST` is a remote server with real data.

## Frontend (apps/web)

`environment: "jsdom"`, `@testing-library/react` + `user-event`. Rendering
anything that reaches the topbar needs the `AuthProvider`, and anything that
reads the query cache needs a `QueryClientProvider`.

No `globals: true` and no `jest-dom` — call `afterEach(cleanup)` yourself and
assert on DOM properties (`input.disabled`), not `toBeInTheDocument()`.

`vitest.config.mts` deliberately does **not** load `vite.config.ts`: the
TanStack router plugin would regenerate `routeTree.gen.ts` on every run.

Four suites guard bugs worth not reintroducing rather than features:
`boot.test.tsx` (the app must render while the session check is in flight),
`routes.test.ts` (no route is the router plugin's `Hello "/..."` scaffold),
`layout.test.ts` (the header is fixed and exactly one thing scrolls) and
`selected-state.test.ts` (a chosen control keeps its colour under the cursor).
All four fail only by looking wrong, never by failing to compile.
