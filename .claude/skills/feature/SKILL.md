---
name: feature
description: New feature workflow - research, plan, implement, test
---

# /feature — New Feature Workflow

Given a feature description, follow this exact workflow.

## 1. Research

- Read the relevant pattern docs from `.claude/CLAUDE.md` that match the feature
- Read existing code in the same domain to understand conventions
- Check `packages/design-system/components/` if this involves UI work — use existing `@repo/design-system` components, don't recreate what exists
- Check existing `lib/`, hooks, stores, and utils before creating new ones

## 2. Plan

- Use TodoWrite to create a checklist of all tasks
- Identify all files to create or modify
- For complex features (5+ files or architectural decisions), present the plan and wait for user approval before implementing

## 3. Implement

- Follow the pattern docs exactly — don't invent new conventions
- Work in small, focused steps — complete one piece before starting the next
- Mark items complete in TodoWrite as you go
- Use `@repo/design-system` components for any UI work — never create custom HTML that duplicates existing components
- Follow all patterns enforced in `.claude/CLAUDE.md` (component structure, stores, modals, static data, etc.)

## 4. Verify

Run these checks on the code you changed:

```bash
# Lint and format
pnpm check

# Build the app (catches TypeScript errors)
pnpm build:app
```

Must pass before considering the feature done. If either fails:
- **Lint errors**: Run `pnpm fix` to auto-fix, then re-check
- **Build/TS errors**: Read the error output, fix the root cause, and re-run
- Do NOT skip verification or move on with failures

## 5. Self-Review

Review every file you created or modified:

- **Pattern compliance**: Does it follow component-structure, store-patterns, modal-patterns, static-data-patterns?
- **Import paths**: Using `@repo/design-system/{component}` direct imports, not barrel imports?
- **Security**: No hardcoded secrets, proper input handling, `rel="noopener"` on external links?
- **Accessibility**: Semantic HTML, ARIA attributes, keyboard handlers alongside mouse events?
- **Performance**: No unnecessary re-renders, proper `useCallback`/`useMemo` where needed?

For each finding:
- **Issue**: Fix it now, re-run verify after fixing
- **Suggestion**: Note it in the summary under "Known improvements"

## 6. Summarize

Provide a short summary:
- **What was built**: describe the feature from the user's perspective
- **Architecture decisions**: any patterns or approaches chosen and why
- **Files created/modified**: list with brief description of each
- **What's NOT included**: anything explicitly out of scope

## Optional: Browser Vision

If the user requests visual verification, or the feature involves complex UI:
1. Read `apps/app/.claude/skills/visual-qa/SKILL.md` — load the visual QA checklist
2. Take or request screenshots of the implemented feature
3. Analyze using the full Visual QA Checklist (alignment, spacing, typography, colors, component correctness, responsive, interactive states)
4. Report findings using the reporting format from the skill doc
