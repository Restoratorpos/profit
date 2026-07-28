---
paths: apps/app/app/**, packages/design-system/**, packages/auth/components/**
---

# Component Rules

## Invariants

- **Never use raw HTML form elements** (`<button>`, `<input>`, `<select>`, `<table>`, `<dialog>`) — compose from `@repo/design-system/components/ui/*`. Forms use the `Field` suite (`FieldGroup`, `Field`, `FieldLabel`, `FieldError`), not hand-rolled `<label>`/`<input>` pairs.
- **The namespace is `@repo/*`.** The design system was imported from another project under `@psy/*` and has been renamed — never reintroduce a `@psy/` import.
- **Icons from `lucide-react` only.**
- **Use `cn()`** from `@repo/design-system/lib/utils` for class merging.
- **Never build inline spinners or empty states** — use `Spinner`, `Empty`.
- **Side panels always open from the right.** Every `Sheet` uses `side="right"` — create, edit, detail, settings, no exceptions. A panel that slides in from a different edge than the last one makes the app feel like two products, and on the desk terminal it puts the form under the operator's hand instead of across the screen. `packages/design-system/components/ui/sheet.tsx` already defaults to `right`; pass it explicitly anyway so the intent is visible at the call site.
- **Keep fields mounted and `disabled` while submitting.** Do not hide, clear, or unmount inputs mid-submit; disable them and the submit button, and keep the values visible.
- **Dark mode is class-based.** `globals.css` keys off `.dark` (`@custom-variant dark (&:is(.dark *))`), so `DesignSystemProvider` must pass `attribute="class"` to next-themes — its default (`data-theme`) styles nothing and the toggle silently does nothing.
- **`useSession()` requires `AuthProvider`**, which is mounted in the **root** layout (`apps/app/app/layout.tsx`), not in `(authenticated)`. A component calling it outside that tree throws.
- **`useSearchParams()` needs a `Suspense` boundary** or the route silently opts out of static rendering.

## Route groups

| Group | Meaning |
|---|---|
| `app/(unauthenticated)/` | sign-in, sign-up — reachable only when signed **out** |
| `app/(authenticated)/` | everything behind a session |

`packages/auth/config.ts` → `authorized` enforces both directions; don't re-implement the check in a page.
