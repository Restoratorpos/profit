#!/bin/bash
set -euo pipefail
# Stop hook: exit 2 forces Claude to keep working until the code typechecks.
#
# Reads the diff to decide which workspaces to check, so it needs a git history.
# The repo has one now; the guard below stays for worktrees that do not.

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  exit 0
fi

CHANGED=$(git diff --name-only HEAD 2>/dev/null | grep -E '\.(ts|tsx)$' || true)
if [ -z "$CHANGED" ]; then exit 0; fi

# Typecheck only the workspaces that actually changed.
FAILED=""

if echo "$CHANGED" | grep -q '^apps/backend/'; then
  if ! pnpm --filter backend typecheck >/tmp/tc-backend.log 2>&1; then
    echo "--- apps/backend typecheck ---" >&2
    grep -E 'error TS' /tmp/tc-backend.log | head -10 >&2 || tail -5 /tmp/tc-backend.log >&2
    FAILED="yes"
  fi
fi

# `packages/` too: apps/web consumes them as source, so a package edit is only
# ever proven by typechecking the app that imports it.
if echo "$CHANGED" | grep -qE '^(apps/web/|packages/)'; then
  if ! pnpm --filter web typecheck >/tmp/tc-web.log 2>&1; then
    echo "--- apps/web typecheck ---" >&2
    grep -E 'error TS' /tmp/tc-web.log | head -10 >&2 || tail -5 /tmp/tc-web.log >&2
    FAILED="yes"
  fi
fi

if [ -n "$FAILED" ]; then
  echo "TYPE ERRORS in changed workspaces — fix before stopping" >&2
  exit 2
fi

exit 0
