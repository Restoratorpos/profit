# apps/app — Next.js Web App

> Monorepo-wide standards, async patterns, JS performance rules and product
> context live in the root `.claude/`. This file covers only what is specific to
> this workspace.

Runs on **:3000**. Next.js 16 (App Router) + React 19 + Tailwind v4.

## What this app actually is

Small. Four pages and two API routes:

```
app/
  layout.tsx                    root — mounts AuthProvider + DesignSystemProvider
  (unauthenticated)/
    sign-in/[[...sign-in]]/     <SignIn />  from @repo/auth
    sign-up/[[...sign-up]]/     <SignUp />  from @repo/auth
  (authenticated)/
    page.tsx                    dashboard
    search/page.tsx             redirects to / without ?q
    components/                 header, sidebar, search
  api/
    auth/[...nextauth]/         Auth.js handlers
    register/                   same-origin front door to the backend
```

Dependencies are deliberately few: `@repo/auth`, `@repo/design-system`,
`@repo/next-config`, `@repo/seo`, `next-themes`, `lucide-react`, `zod`.

**There is no Supabase, Clerk, Inngest, Zustand, React Query, SWR, Axios,
Formik or Yup here.** If a pattern you are about to follow assumes one of those,
it is wrong for this codebase — check `package.json` before adopting it.

Data access is plain `fetch` to the app's own API routes, which forward to the
Hono backend on :7090. `AUTH_BACKEND_URL` is server-only on purpose: the browser
never calls the backend directly, so there is no CORS surface and one place to
change if the API moves.

## Invariants

- **`AuthProvider` is mounted in the root layout**, not in `(authenticated)`.
  `useSession()` is called from the sidebar and throws anywhere the provider is
  absent. Do not move it.
- **`useSearchParams()` needs a `Suspense` boundary**, or the route silently
  opts out of static rendering.
- **Dark mode is class-based.** `globals.css` uses
  `@custom-variant dark (&:is(.dark *))`, so `DesignSystemProvider` must pass
  `attribute="class"` to next-themes — its default (`data-theme`) styles nothing
  and the toggle silently does nothing.
- **Never use raw HTML form elements** (`<button>`, `<input>`, `<select>`,
  `<table>`, `<dialog>`). Compose from `@repo/design-system/components/ui/*`;
  forms use the `Field` suite, not hand-rolled `<label>`/`<input>` pairs.
- **The namespace is `@repo/*`.** The design system arrived from another project
  as `@psy/*`; that rename is done — never reintroduce it.
- **Icons from `lucide-react` only.**
- Route groups are enforced by `packages/auth/config.ts` → `authorized`. Don't
  re-implement the signed-in/signed-out check inside a page.

## Tests

`vitest run`, `environment: "jsdom"`, `@testing-library/react`.

The config has **no `globals: true`, no setup file, and no `jest-dom`**. Two
consequences that will bite you:

- **Auto-cleanup is not registered.** Renders accumulate across tests in a file
  and `getByRole` starts throwing "found multiple elements". Call
  `afterEach(cleanup)` yourself.
- **`toBeInTheDocument()`, `toBeDisabled()` etc. do not exist.** Assert on DOM
  properties instead (`input.disabled`, `el.textContent`).

Rendering a page that calls `useSession()` needs the `AuthProvider`, and one
that calls `useSearchParams()` needs a `Suspense` boundary.

## Rules

Everything under `rules/frontend/` is generic React 19 / Next.js 16 guidance and
applies as written.

**Composition and a11y** — read these when building UI:

- `rules/frontend/shadcn-composition.md` — Group wrappers, `asChild` triggers,
  InputGroup, Dialog titles, Card composition, overlay z-index
- `rules/frontend/accessibility-patterns.md` — WCAG 2.1 AA, ARIA, keyboard nav,
  live regions, form a11y checklist

**Re-renders** — `rules/frontend/rerender-*.md`: derived state, functional
setState, lazy init, narrow deps, memoization, transitions, refs for transient
values, effects vs. event handlers.

**Rendering** — `rules/frontend/rendering-*.md`: conditional render, hoisted
JSX, `<Activity>`, `content-visibility`, hydration without flicker, SVG.

**Bundles** — `rules/frontend/bundle-*.md`: barrel imports, dynamic imports,
deferring third-party scripts, preloading on intent.

**Server Components** — `rules/frontend/server-*.md`: minimize serialization at
the RSC boundary, parallel fetching by composition, avoid duplicate props.
Plus `rules/frontend/async-suspense-boundaries.md`.

**Client-side** — `rules/frontend/client-localstorage-schema.md`,
`client-passive-event-listeners.md`, `js-batch-dom-css.md`, `js-cache-storage.md`,
`advanced-*.md`.

**Naming** — `rules/shared/naming-encode-intent.md`: `fetchXOrThrow`, `tryX`,
`assertX`, `is/has/can/should` for booleans.

**i18n** — `rules/frontend/i18n-patterns.md`. The app is English-only today; the
`@repo/internationalization` package exists but this app does not depend on it.

## History

This directory previously held ~112 files documenting a different product
entirely (Psyro — Supabase, Clerk, Inngest, a knowledge graph of Signals and
Studies). It was imported wholesale and described systems that do not exist
here, while being loaded into context on every task in this workspace. It was
trimmed on 2026-07-21 to the 40 rules that are genuinely about React and
Next.js. If you find a surviving reference to Supabase, `organization_id`,
`useAxios`, or `@psy/*`, it is a leftover — delete it.
