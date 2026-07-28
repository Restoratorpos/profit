---
name: fix
description: Bug fix workflow - understand, fix, test, verify
---

# /fix — Bug Fix Workflow

Given a bug description, follow this exact workflow.

## 1. Understand

- Read the relevant source files where the bug likely lives
- Read the related pattern doc from `.claude/CLAUDE.md` to understand the expected pattern
- If the bug involves a specific domain, read the corresponding store, features hook, and component

## 2. Reproduce

- Identify what the correct behavior should be
- Identify what's actually happening (the bug)
- Find the root cause — don't guess, trace the logic

## 3. Check Escalation

If this bug touches any of the following, STOP and tell the user before proceeding:
- Authentication, permissions, or CORS
- Database schema or migrations
- Billing or pricing logic
- Credential encryption

## 4. Fix

- Minimal changes — fix the root cause only
- Don't refactor surrounding code — fix the bug and nothing else
- Follow the pattern docs enforced in `.claude/CLAUDE.md`

## 5. Verify

Run these checks on the code you changed:

```bash
# Lint and format
pnpm check

# Build the app (catches TypeScript errors)
pnpm build:app
```

Must pass before continuing. If either fails:
- **Lint errors**: Run `pnpm fix` to auto-fix, then re-check
- **Build/TS errors**: Read the error output, fix the root cause, and re-run
- Do NOT skip verification or move on with failures

## 6. Self-Review

Review every file you modified:

- **Root cause addressed**: Does the fix target the actual cause, not a symptom?
- **No regressions**: Could this change break anything else?
- **Pattern compliance**: Does it still follow component-structure, store-patterns, modal-patterns?
- **Minimal diff**: Did you change only what was necessary?

For each finding:
- **Issue**: Fix it now, re-run verify
- **Suggestion**: Note in summary under "Known improvements"

## 7. Summarize

Provide a short summary:
- **What was broken**: describe the user-facing symptom
- **Root cause**: what was actually wrong in the code
- **Fix**: what you changed and why
- **Files changed**: list of modified files

## Optional: Browser Vision

If the user requests visual verification, or the fix involves UI layout changes:
1. Read `apps/app/.claude/skills/visual-qa/SKILL.md` — load the visual QA checklist
2. Take or request before/after screenshots
3. Analyze using the full Visual QA Checklist
4. Report before/after comparison using the reporting format from the skill doc
