#!/bin/bash
set -euo pipefail
# Stop hook: exit 2 forces Claude to keep working until the code typechecks.
#
# NOTE: this repo is currently NOT a git repository, so there is no diff to read
# and the hook cannot tell which workspace was touched. It therefore does nothing
# until a git history exists. Run `git init` and this starts working.

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

if echo "$CHANGED" | grep -qE '^(apps/app/|packages/)'; then
  if ! pnpm --filter app typecheck >/tmp/tc-app.log 2>&1; then
    echo "--- apps/app typecheck ---" >&2
    grep -E 'error TS' /tmp/tc-app.log | head -10 >&2 || tail -5 /tmp/tc-app.log >&2
    FAILED="yes"
  fi
fi

if [ -n "$FAILED" ]; then
  echo "TYPE ERRORS in changed workspaces — fix before stopping" >&2
  exit 2
fi

exit 0
