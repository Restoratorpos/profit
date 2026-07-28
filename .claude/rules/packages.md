---
paths: "packages/**"
---

# Package Rules

Shared workspace packages live under `packages/` and are consumed as **`@repo/*`**.

| Package | Purpose |
|---|---|
| `@repo/auth` | Auth.js v5 — credentials provider, middleware config, sign-in/up components |
| `@repo/design-system` | shadcn/ui + Tailwind v4 components, theme provider |
| `@repo/next-config` | shared Next config |
| `@repo/seo`, `@repo/storage`, `@repo/internationalization` | as named |
| `@repo/typescript-config` | `base.json` (Node), `nextjs.json`, `react-library.json` |

## Invariants

- **The namespace is `@repo/*`.** The design system arrived from another project as `@psy/*`; that rename is done — do not reintroduce it.
- **Packages are consumed as TypeScript source**, not built. They are imported through the `@repo/*` path alias in each app's tsconfig.
- **Extend the shared tsconfig**: `@repo/typescript-config/base.json` for Node (apps/backend), `nextjs.json` for anything React.
- **`declaration: false` in Next-side packages.** `base.json` turns declarations on; under pnpm's non-hoisted layout that makes tsc demand every inferred type be nameable, which explodes on next-auth's re-exported `@auth/core` types (TS2742). Next apps never emit `.d.ts` anyway.
- **Never put app-specific logic in a package.**
- **Never reach into another package's internals** — import through its documented entry points.
- Keep dependencies minimal; a package dependency is paid by every consumer.

## Shared code that must stay in sync

`normalizePhone` exists in **both** `packages/auth/lib/phone.ts` and `apps/backend/src/lib/phone.ts`. Phone numbers are stored and compared as bare digits; if these two diverge, every login fails silently. Change them together.
