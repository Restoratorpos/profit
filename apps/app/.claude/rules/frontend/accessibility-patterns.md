# Accessibility (a11y) Patterns

Target: **WCAG 2.1 AA** compliance. The design system (Radix UI primitives) provides the foundation — this doc covers what you must do on top of it.

---

## Keyboard Navigation

### Every interactive element must be keyboard-accessible

```tsx
// Correct: div acting as tab uses tabIndex + onKeyDown
<div
  role="tab"
  tabIndex={0}
  aria-selected={isActive}
  onClick={handleClick}
  onKeyDown={(e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      handleClick()
    }
  }}
>
```

### Arrow key navigation for lists, tabs, menus

```tsx
const handleKeyDown = (e: React.KeyboardEvent) => {
  switch (e.key) {
    case "ArrowDown":
      e.preventDefault()
      setSelectedIndex((prev) => Math.min(prev + 1, items.length - 1))
      break
    case "ArrowUp":
      e.preventDefault()
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
      break
    case "Enter":
      e.preventDefault()
      onSelect(items[selectedIndex])
      break
    case "Escape":
      onClose()
      break
  }
}
```

### Focus management for modals and panels

- Dialogs auto-trap focus (Radix Dialog handles this)
- When `onOpenAutoFocus` interferes (e.g., popover over search input), prevent it:
  ```tsx
  <PopoverContent onOpenAutoFocus={(e) => e.preventDefault()}>
  ```
- After closing a panel, return focus to the trigger element
- Use `scrollIntoView({ behavior: "smooth", block: "nearest" })` for active items in scrollable lists

---

## ARIA Patterns

### Forms — always pair inputs with labels and errors

```tsx
<Field>
  <FieldLabel htmlFor="person-name">Full Name</FieldLabel>
  <Input
    id="person-name"
    aria-describedby={hasError ? "person-name-error" : undefined}
    aria-invalid={hasError}
  />
  <FieldError id="person-name-error">{errorMessage}</FieldError>
</Field>
```

The `<FieldError>` component in `@repo/design-system` automatically uses `role="alert"`.

### Forms during submission — use aria-busy

```tsx
<Form aria-busy={isSubmitting}>
  <fieldset disabled={isSubmitting}>
    {/* fields */}
  </fieldset>
</Form>
```

### Tabs — role, aria-selected, keyboard

```tsx
<div role="tablist">
  {tabs.map((tab) => (
    <div
      key={tab.id}
      role="tab"
      tabIndex={isActive ? 0 : -1}
      aria-selected={isActive}
      onKeyDown={handleTabKeyDown}
    >
      {tab.label}
    </div>
  ))}
</div>
```

### Search/combobox — role="listbox" + role="option"

```tsx
<div role="listbox" aria-label="Search results">
  {results.map((result, i) => (
    <div
      key={result.id}
      role="option"
      aria-selected={i === selectedIndex}
    >
      {result.title}
    </div>
  ))}
</div>
```

### Icon-only buttons — always add aria-label

```tsx
// Correct
<Button variant="ghost" size="icon" aria-label="Collapse sidepanel">
  <PanelRightClose className="size-4" />
</Button>

// Also correct: sr-only text
<Button variant="ghost" size="icon">
  <X className="size-4" />
  <span className="sr-only">Close</span>
</Button>
```

### Dialogs without visible title — use sr-only

```tsx
<Dialog>
  <DialogContent>
    <DialogTitle className="sr-only">Search</DialogTitle>
    {/* visible content */}
  </DialogContent>
</Dialog>
```

---

## Live Regions for Content That Arrives Later

When content appears without a user action — a form error, a result that streams
in, a status that changes — screen readers need to be told:

```tsx
// Polite announcement for non-urgent updates
<div aria-live="polite" aria-atomic={false}>
  {streamingText}
</div>

// Assertive for errors
<div role="alert" aria-live="assertive">
  {errorMessage}
</div>
```

### Loading states — use role="status"

```tsx
// Spinner component already does this:
<Spinner aria-label="Loading" role="status" />

// For custom loading indicators:
<div role="status" aria-label="Signing in">
  <AnimatedDots />
</div>
```

---

## Color and Contrast

- All text must meet **4.5:1 contrast ratio** against its background (AA standard)
- Large text (18px+ or 14px+ bold): **3:1 minimum**
- Never convey information through color alone — always pair with icons, text, or patterns
- The design system's `text-muted-foreground` on `bg-background` already meets AA — don't use lighter custom grays
- Focus indicators: `focus-visible:ring-3` (built into design system components)

---

## Design System Components to Use

| Need | Use | Why |
|------|-----|-----|
| Buttons | `Button` from `@repo/design-system` | Focus ring, disabled state, keyboard |
| Inputs | `Input` + `Field` + `FieldLabel` | Auto label association, error alerts |
| Selects | `Select` from `@repo/design-system` | Radix Select — full keyboard + ARIA |
| Checkboxes | `Checkbox` from `@repo/design-system` | Radix Checkbox — focus + aria-invalid |
| Dialogs | `Dialog` from `@repo/design-system` | Radix Dialog — focus trap, Escape close |
| Tooltips | `Tooltip` from `@repo/design-system` | Delayed show, keyboard accessible |
| Dropdowns | `DropdownMenu` from `@repo/design-system` | Full role management via Radix |
| Loading | `Spinner` from `@repo/design-system` | `role="status"` + `aria-label="Loading"` |

**NEVER** use raw `<button>`, `<input>`, `<select>` — the design system handles a11y automatically.

---

## Checklist for Every Component

1. Can all interactive elements be reached via Tab key?
2. Can all actions be triggered via Enter/Space?
3. Can lists/menus be navigated with Arrow keys?
4. Does Escape close modals/popovers/dropdowns?
5. Do all form inputs have associated labels (`htmlFor` or `aria-label`)?
6. Do all icon-only buttons have `aria-label` or `sr-only` text?
7. Do error messages use `role="alert"` or `aria-live="assertive"`?
8. Do loading states use `role="status"` or `aria-busy`?
9. Is focus returned to the trigger after closing modals/panels?
10. Does content that appears on its own use `aria-live="polite"` (or `role="alert"` when it is an error)?
