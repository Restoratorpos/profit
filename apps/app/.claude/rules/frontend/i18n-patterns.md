# Internationalization (i18n) Status

**Current state: English-only.** No i18n library is installed. All UI text is hardcoded in English.

---

## Text Conventions (Pre-i18n)

Until i18n is adopted, follow these patterns to make future extraction easier:

### Keep user-facing strings extractable

```tsx
// Correct: string literals are easy to find and extract later
<Button>Create Signal</Button>
<p>No signals found. Create one to get started.</p>

// Avoid: template literals with logic make extraction harder
<Button>{`${isEditing ? "Update" : "Create"} Signal`}</Button>

// Better: separate strings
<Button>{isEditing ? "Update Signal" : "Create Signal"}</Button>
```

### Static text arrays in mocks/

Per `static-data-patterns.md`, all dropdown options, tab labels, and filter arrays live in `mocks/{group}/{domain}/index.ts`. This centralizes text for future i18n extraction.

### Date/time formatting

Use `Intl.DateTimeFormat` or `Intl.RelativeTimeFormat` — they respect locale automatically:

```typescript
// Correct: locale-aware
new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date)
new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(-2, "day")

// Avoid: hardcoded format strings
`${date.getMonth()}/${date.getDate()}/${date.getFullYear()}`
```

### Number formatting

```typescript
// Correct: locale-aware
new Intl.NumberFormat("en-US", { notation: "compact" }).format(1234)
// → "1.2K"

// Avoid: manual formatting
`${(n / 1000).toFixed(1)}k`
```

---

## When i18n is Adopted

The recommended approach for this stack:

1. **Library**: `next-intl` (best Next.js App Router integration)
2. **Message format**: ICU MessageFormat (handles plurals, gender, etc.)
3. **File structure**: `messages/{locale}.json` at project root
4. **RTL**: Not needed for initial launch (English + European languages)
5. **Extraction**: Run codemod to replace hardcoded strings with `t()` calls

This doc will be updated when i18n is implemented.
