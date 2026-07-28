---
name: tdd
description: Test-driven development - RED, GREEN, REFACTOR cycle
---

# /tdd — Test-Driven Development Workflow

Given a feature or behavior description, follow strict RED → GREEN → REFACTOR discipline.

> **Note**: This workflow requires a test framework to be installed. If no test runner exists yet (`vitest`, `jest`, etc.), inform the user and offer to set one up before proceeding.

## 1. Understand

- Read relevant source files and pattern docs from `.claude/CLAUDE.md`
- Check `packages/design-system/components/` and existing `lib/`, hooks, utils — don't rebuild what exists
- Break the feature into small, testable behaviors — list them out using TodoWrite
- Read existing test files in the same domain to match patterns (if any exist)

## 2. RED — Write a Failing Test

For the FIRST behavior only:
- Write a test that describes the expected behavior
- Place it colocated next to the source file (e.g., `index.test.tsx` beside `index.tsx`)
- Run the test suite — **the new test MUST FAIL**
- If it passes, your test is not testing anything new — rewrite it
- Confirm the failure message matches what you expect (failing for the RIGHT reason)

**Rules:**
- NEVER write implementation code before the test fails
- ONE behavior per cycle — don't write all tests upfront
- Test the interface/behavior, not the implementation details

**Test file placement — one test per component:**
- Every component with props, logic, conditional rendering, or interactions gets its own colocated test file
- Example: `customs/header/index.tsx` → `customs/header/index.test.tsx`
- A parent view's test tests the composition — that children render together correctly
- Trivial components (static text, no props) can be covered by the parent's composition test
- When in doubt, give it its own test file

## 3. GREEN — Minimal Implementation

- Write the MINIMUM code to make the failing test pass
- No extra logic, no future-proofing, no "while I'm here" additions
- Run tests — ALL must pass (new test + existing tests)
- If any test fails, fix the implementation — not the test

**Rules:**
- Only code that's required to pass the test
- Don't refactor yet — that's the next step
- Don't add error handling for cases the test doesn't cover yet

## 4. REFACTOR

- Look at the code you just wrote + surrounding code
- If it's clean and readable, skip this step
- If not: extract functions, simplify conditionals, improve naming, remove duplication
- Run tests after every refactor change — they must still pass
- Follow the pattern docs enforced in `.claude/CLAUDE.md`

## 5. REPEAT

- Go back to step 2 for the next behavior in your list
- Continue the RED → GREEN → REFACTOR cycle until all behaviors are covered
- Mark items complete in TodoWrite as you go
- Each cycle should be small — a few minutes, not an hour

## 6. Verify

Run full checks:

```bash
pnpm check
pnpm build:app
```

If either fails:
- **Lint errors**: Run `pnpm fix` to auto-fix, then re-check
- **Build/TS errors**: Read the error output, fix the root cause, and re-run
- Do NOT skip verification or move on with failures

## 7. Self-Review

Review every file you created or modified:
- **Test quality**: Tests cover behavior, not implementation details?
- **Pattern compliance**: Implementation follows `.claude/CLAUDE.md` patterns?
- **No over-testing**: Trivial components covered by parent tests, not duplicated?
- **No under-testing**: Every meaningful behavior has a test?

For each finding:
- **Issue**: Fix it now, re-run verify
- **Suggestion**: Note in summary under "Known improvements"

## 8. Summarize

- **Behaviors tested**: list each behavior with its test
- **Files created/modified**: tests and implementation
- **Test count**: how many tests were added
