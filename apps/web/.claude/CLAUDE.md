# apps/web — Vite SPA

> Replaces `apps/app` (Next.js). Both run during the migration; `apps/app` is
> deleted in Phase 5. See `MIGRATION-VITE.md` at the repo root.

Runs on **:3001**. Vite 7 + React 19 + TanStack Router + TanStack Query.
`strictPort` is on — if 3001 is busy the dev server **fails** rather than
quietly moving to 3002, because a stale server on the port you opened is a
whole afternoon of "my changes do nothing".

## Layout

```
src/
  routes/        Routing only. File-based; routeTree.gen.ts is generated.
  features/      One folder per domain. Owns its data, types and UI.
    plans/
      api.ts             queries + mutation hooks (was actions.ts)
      types.ts           wire shapes (was lib/plans.ts)
      index.ts           the feature's public surface
      components/        plans-page.tsx (was page.tsx), views, sheets
  components/    Shared app UI: the shell, and widgets used by 2+ features.
  lib/
    api/client.ts        apiFetch / apiPost / apiPatch / apiDelete
    auth/                session, tokens, guards, sign-in/out
    i18n/                locale + dictionary
    query-client.ts      cache config and persistence
    format.ts            formatMoney and friends
    date.ts              every date a person reads
```

**Rules that keep this from rotting:**

- A route file wires a loader and a component. No data logic, no markup.
- Import a feature through `features/<name>` (its `index.ts`), never by reaching
  into `features/<name>/components/…`.
- A component used by two features moves to `src/components/`. One used by one
  feature stays inside it.
- Features do not import each other's internals. If two need the same thing, it
  belongs in `lib/` or `components/`.

## Dates: `lib/date.ts`, never `Intl.DateTimeFormat`

Every date a person reads goes through `lib/date.ts` — `formatDate`
("8 mart, 2026"), `formatDay`, `formatDateTime`, `formatStamp`, `formatTime`,
`formatMonth` — each taking the app `Locale`. Machine-shaped values use
`toDateInput` / `isoDay` and stay `"YYYY-MM-DD"`.

**Do not reach for `Intl.DateTimeFormat`.** ICU has no Uzbek month data:
`uz-UZ` renders August as **"M08"** and puts the year first, so every screen
showed stamps like `"2026 M08 3 08:12"`. Hard-coding `"en-GB"` to dodge that was
the other half of the bug — English months in an Uzbek UI. The month names are a
table in `lib/date.ts`; `__tests__/date-format.test.ts` asserts the shape.

The one legitimate `Intl` date consumer is the calendar grid, which is date-fns
locales via `components/date-field.tsx`.

## Deep links: the URL seeds a screen, it does not own it

`/members`, `/inventory/` and `/orders/` take search params so the dashboard's
attention cards can open them already narrowed — `?filter=expiring`,
`?sort=stock`, `?q=<phone>`. `/workers` is the exception and owns its range
outright, because a date range *is* the question that screen answers.

For the other three the filters stay component state and only their **opening
values** come from the URL. Typing in a search box does not rewrite the address
bar: a keystroke in the URL is a history entry per character, and the members
search is debounced against a server round trip. A link is therefore
reproducible when opened and stale the moment it is used.

What that costs, and what each piece is for:

- **Every field is `.optional().catch(undefined)`.** Optional keeps a bare
  `<Link to="/inventory">` from having to name filters it does not care about —
  making one field required makes `search` required at *every* call site to that
  path. The `.catch` means a hand-mangled link opens the plain screen instead of
  an error page.
- **Free text goes through `lib/search-text.ts`, never a bare `z.string()`.**
  The router JSON-encodes search values, so an all-digit term round-trips as
  `q="998901234567"` — and trimming those quotes hands zod a *number*, which a
  plain string schema rejects and `.catch` then swallows, opening the screen
  unfiltered with nothing to say why. A phone is exactly what the dashboard
  passes, so this is the common case.
- **Resolve defaults in one exported helper** (`memberQueryFrom`,
  `stockSeedFrom`, `orderSeedFrom`), so the route loader and the page derive the
  same value and a deep link does not fetch the same page twice.
- **Key the view on the seed.** Navigating within one route does not remount, so
  without a `key` the sidebar's plain "A'zolar" link clears the URL while the
  screen keeps the old filter.

`__tests__/deep-links.test.ts` covers the fallbacks; `dashboard.test.tsx`
asserts the hrefs the cards actually write.

## The router plugin will overwrite your route files

`@tanstack/router-plugin` scaffolds a stub into any route file it finds missing
or empty. Shell redirection truncates before it writes, so `cat > route.tsx`
with the dev server running gives the watcher an empty file to scaffold over —
**mid-write**. Five routes were silently lost this way; `/transactions` and
friends reverted to `Hello "/_authed/transactions"!`.

Nothing in the normal loop catches it. A scaffold is valid TypeScript, so
typecheck, lint and the production build all pass. It only shows up by opening
the page.

- **Write route files with an editor/atomic write, never `cat >` or `>`.**
- `__tests__/routes.test.ts` asserts no route is a scaffold and every ported
  route names a `@/features/` component. Keep its `NOT_YET_PORTED` list current
  as verticals land.
- If a route renders `Hello "/_authed/…"!`, it was clobbered — restore it, do
  not re-derive why it "stopped working".

## Porting a vertical from apps/app

The translation is mechanical. For `<name>`:

| Next | here |
| --- | --- |
| `page.tsx` (server fetch) | `features/<name>/components/<name>-page.tsx` with `useQuery` |
| `actions.ts` (`"use server"`) | `features/<name>/api.ts` — `queryOptions` + mutation hooks |
| `revalidatePath("/x")` | `invalidateQueries({ queryKey: keys.all })` **inside the hook** |
| `lib/<name>.ts` | `features/<name>/types.ts` |
| view/sheet components | copied as-is; drop `"use client"`, fix imports |
| `useRouter().refresh()` | nothing — invalidation already refetches |

Steps that are easy to get wrong:

1. **Invalidation lives in the mutation hook, not the call site.** A component
   that forgets to invalidate leaves a stale table, and on a shared desk a stale
   table is two operators disagreeing about the data.
2. **Use the route `loader` with `ensureQueryData`** so fetching starts during
   navigation rather than on mount. Do not await it — the route should still
   render immediately.
3. **Mutation state replaces hand-rolled pending flags.** `mutation.variables`
   is the argument of the in-flight call, which is exactly the row to spin.
4. **Errors are `Error`, not `{ ok, error }`.** Read `error.message`; the
   `ActionResult` envelope does not exist here.
5. Only gate rendering on the query the page cannot draw without. Lists that
   only populate pickers inside a sheet should not hold the table back.

`features/plans` is the reference implementation, and
`__tests__/plans.test.tsx` is the reference test — it asserts the list renders,
that a mutation refetches, and that an in-use plan refuses deletion.

## Tests

`vitest run`, `environment: "jsdom"`, `@testing-library/react` + `user-event`.
`vitest.config.mts` deliberately does **not** load `vite.config.ts`: the router
plugin would regenerate `routeTree.gen.ts` on every run.

No `globals: true`, no `jest-dom` — call `afterEach(cleanup)` yourself and
assert on DOM properties (`input.disabled`), not `toBeInTheDocument()`.

`__tests__/boot.test.tsx` guards a bug worth not reintroducing: the app must
render while the boot session check is still in flight. It previously used a
top-level `await` before `createRoot().render()`, so a hung request meant React
never mounted — a blank page with nothing in the log.
