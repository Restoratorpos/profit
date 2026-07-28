---
name: refactor
description: Refactoring workflow - analyze, plan, execute, verify
---

# /refactor — Refactoring Workflow

Given a refactoring goal, follow this exact workflow.

## 1. Analyze

- Read all files involved in the refactoring scope
- Understand the current behavior — document what the code does today
- Identify the specific problem (duplication, complexity, wrong pattern, etc.)

## 2. Plan

- Use TodoWrite to create a checklist of all tasks
- List every file that will be modified
- Confirm: this is behavior-preserving — no business logic changes
- For large refactors (5+ files), present the plan and wait for user approval before starting

## 3. Verify Current State

Run checks BEFORE making changes to establish a baseline:

```bash
pnpm check
pnpm build:app
```

If they fail now, note the failures — don't fix pre-existing issues during a refactor.

## 4. Refactor

- Work in small steps — one change at a time
- After each meaningful change, run `pnpm check` to catch issues early
- Follow the pattern docs enforced in `.claude/CLAUDE.md`
- Mark items complete in TodoWrite as you go

## 5. Verify

Run the same checks again:

```bash
pnpm check
pnpm build:app
```

Results must be the same or better than baseline — no new failures. If either fails:
- **Lint errors**: Run `pnpm fix` to auto-fix, then re-check
- **Build/TS errors**: Read the error output, fix the root cause, and re-run
- Do NOT skip verification or move on with failures

## 6. Self-Review

Review every file you modified:

- **Behavior preserved**: Does the code still do exactly what it did before?
- **Pattern compliance**: Does it now follow component-structure, store-patterns, modal-patterns, static-data-patterns?
- **No scope creep**: Did you change only what was planned? No feature additions or unrelated fixes?
- **Import paths**: All correct after moves/renames?

For each finding:
- **Issue**: Fix it now, re-run verify
- **Suggestion**: Note in summary under "Known improvements"

## 7. Summarize

Provide a short summary:
- **What was refactored**: describe the scope
- **Why**: what problem this solves
- **Approach**: what pattern or structure you moved toward
- **Behavior changes**: NONE (confirm explicitly)
- **Files changed**: list of modified files
