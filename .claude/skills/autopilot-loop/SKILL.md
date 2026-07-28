---
name: autopilot-loop
description: Autonomous delivery cycle - iterative loop until completion quality met
disable-model-invocation: true
---

# /autopilot-loop — Autonomous Delivery Cycle

Run a strict iterative loop for a scoped task until completion quality is met.

## Required Cycle (in order)

1. **Plan**
   - Restate goal, constraints, and explicit acceptance criteria.
   - Identify touched code areas and touched contracts/workflows.
2. **Implement**
   - Make the smallest viable code change set.
   - Keep edits scoped; avoid unrelated refactors.
3. **Verify**
   - Run lint/type/tests relevant to touched code.
   - Record failures and fix before continuing.
4. **Contract Sync**
   - Update `apps/app/.claude/contracts/*` affected by route/event/schema/store/env/package changes.
5. **Workflow Update**
   - Update `apps/app/.claude/workflows/*` if end-to-end behavior changed.
6. **Summarize**
   - Report what changed, verification results, and residual risk.

## Hard Gates

- Do not skip steps 3-5.
- If verification fails, return to step 2.
- If contracts/workflows are stale, return to step 4/5.
- Stop only when acceptance criteria pass and docs are synced.

## Exit Template

- Goal: ...
- Code changes: ...
- Verification: lint/type/tests + outcomes
- Contract updates: files updated
- Workflow updates: files updated or "none"
- Remaining risks: ...
