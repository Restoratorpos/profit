#!/bin/bash
# SessionStart hook: inject current branch + recent changes as context

BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
RECENT=$(git log --oneline -5 2>/dev/null || echo "no commits")
MODIFIED=$(git diff --stat HEAD 2>/dev/null | tail -3)
UNSTAGED=$(git status --short 2>/dev/null | head -10)

cat <<EOF
{"additionalContext": "Branch: ${BRANCH}\nRecent commits:\n${RECENT}\nUnstaged changes:\n${UNSTAGED}"}
EOF
