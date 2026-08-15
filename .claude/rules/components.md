---
paths: apps/web/src/**, packages/design-system/**, packages/auth/components/**
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
- **`useAuth()` requires `AuthProvider`**, which is mounted in the **root** route (`apps/web/src/routes/__root.tsx`), not in `_authed` — the topbar's user menu calls it, and it throws anywhere the provider is absent. (This replaced next-auth's `useSession`, which went with `apps/app`.)
- **Selected is one thing.** A chosen control uses `SELECTED_TINT` from `@repo/design-system/lib/selected` — a soft green tint, not a solid fill. It restates its own hover colours (or `Button`'s `outline` variant repaints the selection grey under the cursor) and restates them again under `dark:` (or the variant's own `dark:bg-input/30` wins on specificity and the tint never appears in a dark theme).

## Routes

| Path | Meaning |
|---|---|
| `src/routes/sign-in.tsx`, `sign-up.tsx` | reachable only when signed **out** |
| `src/routes/_authed/` | everything behind a session |

The `_authed` layout route enforces it. There is no middleware — nothing runs
on a server. Don't re-implement the check inside a page.
