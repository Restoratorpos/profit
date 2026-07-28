---
name: review
description: Code review workflow - read, analyze, report issues
---

# /review — Code Review Workflow

Given a file, directory, or PR to review, follow this exact workflow.

## 1. Read the Code

- Read every file in the scope of the review
- Understand the intent — what is this code trying to do?

## 2. Check Patterns

Compare against the project conventions in `.claude/CLAUDE.md`:
- [ ] Component structure follows `customs/` folder pattern (folder with `index.tsx`, not loose files)
- [ ] Imports organized correctly (`@repo/design-system` → external → `@/` internal → relative)
- [ ] Uses `type` imports for type-only imports
- [ ] Uses `@repo/design-system` components — no custom HTML that duplicates the design system
- [ ] Uses `cn()` from `@repo/design-system/lib/utils` for class merging
- [ ] Icons from `lucide-react` only
- [ ] `const` arrow functions, event handlers prefixed with `handle` or `on`
- [ ] Early returns — guard clauses first, happy path last
- [ ] Modals follow modal-patterns.md (features.ts, customs/, `onPointerDownOutside`)
- [ ] Static data in `mocks/`, not inline in components or features files
- [ ] Stores follow store-patterns.md (single setter, named StateCreator, initial export)

## 3. Check Data Patterns (when services/ layer exists)

- [ ] Service hooks use React Query — never raw `fetch()`
- [ ] Query keys use factories from `keys.ts`, not inline strings

## 4. Check Performance

- [ ] No unnecessary re-renders (stable callbacks, proper deps)
- [ ] `useMemo`/`useCallback` where appropriate
- [ ] No N+1 queries or sequential awaits that could be parallel
- [ ] No large objects in React state that should be refs

## 5. Check Security

- [ ] No secrets, API keys, or .env values in code
- [ ] No raw user input in queries (SQL injection risk)
- [ ] No `dangerouslySetInnerHTML` without sanitization
- [ ] `rel="noopener"` on external links with `target="_blank"`
- [ ] Auth checked server-side, not just client-side

## 6. Report

Provide findings organized by severity:
- **Blockers**: Must fix before merging (security, data leaks, broken functionality)
- **Issues**: Should fix (pattern violations, performance problems)
- **Suggestions**: Nice to have (readability, minor improvements)
- **Good**: Things done well worth calling out
