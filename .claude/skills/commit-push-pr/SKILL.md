---
name: commit-push-pr
description: Commit staged/unstaged changes, push to origin, and open a PR
disable-model-invocation: true
---

# /commit-push-pr — Commit, Push, and Open a PR

Commit staged/unstaged changes, push to origin, and open a PR if applicable.

## Branch Rules

| Current branch | Target branch | Create PR? |
|----------------|--------------|------------|
| Any non-`dev` branch | `dev` | **Yes** |
| `dev` | — | **Never push directly to dev** |
| `main` | — | **Never push directly to main** |

## Workflow

### 1. Gather context (run in parallel)
```bash
git status
git diff HEAD
git log --oneline -5
git branch --show-current
```

### 2. Stage and commit
- Stage only the relevant files — never `git add -A` blindly (risk of committing secrets)
- Commit message format: `type: short description`
  - Types: `feat`, `fix`, `chore`, `refactor`, `docs`, `test`, `style`
- Always append co-author trailer:
  ```
  Co-Authored-By: Claude <noreply@anthropic.com>
  ```
- Use a HEREDOC for the commit message to preserve formatting

### 3. Push
```bash
git push origin <current-branch>
# Add -u flag on first push: git push -u origin <current-branch>
```

### 4. Check existing PR state

Before creating a PR, check if one already exists for this branch:

```bash
gh pr view --json state,url,baseRefName 2>/dev/null
```

Then decide based on the result:

| PR state | Action |
|----------|--------|
| No PR exists | Create a new PR targeting `dev` |
| `OPEN` | PR is still active — **do not create a new one**. Return the existing PR URL to the user. |
| `MERGED` | Branch was already merged — create a **new PR** targeting `dev` with the new commits |
| `CLOSED` | PR was closed without merging — create a new PR targeting `dev` |

### 5. Create PR (if needed)

```bash
gh pr create \
  --title "<type>: short description" \
  --base dev \
  --body "$(cat <<'EOF'
## Summary
- <bullet points describing what changed>

## Test plan
- [ ] <specific things to verify>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Return the PR URL to the user.

## Examples

**Feature branch → main PR:**
```
Branch: feat/add-export-button
Commit: feat: add CSV export to insights table
Push: git push origin feat/add-export-button
PR: gh pr create --base dev --title "feat: add CSV export to insights table"
```

## Safety Checks

- **Never push to `main` or `dev`** — warn the user and stop
- **Never commit `.env*` files** — check staged files before committing
- **Never use `--no-verify`** — fix hook failures instead
- **Never force push** unless user explicitly requests it
