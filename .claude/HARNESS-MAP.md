# GYM — Claude Harness Map

> What lives where in `.claude/`, and when to update it.

## Repository structure

```
GYM/
├── .claude/
│   ├── CLAUDE.md          ← Master rules: stack, architecture, conventions, gotchas
│   ├── HARNESS-MAP.md     ← This file
│   ├── settings.json      ← Permissions, hooks
│   ├── settings.local.json← Personal overrides (gitignored)
│   ├── rules/             ← Path-scoped coding rules, auto-loaded on matching files
│   ├── agents/            ← Subagent definitions
│   ├── skills/            ← Invokable workflows (/feature, /fix, /tdd, /review, …)
│   ├── hooks/             ← session-context, post-edit-lint, verify-before-stop
│   ├── scripts/           ← validate-bash (PreToolUse guard)
│   ├── product/           ← Product context (vision, concepts)
│   ├── agent-memory/      ← Subagent persistent memory
│   └── output-styles/
│
├── apps/
│   ├── app/               ← Next.js 16 + React 19 web app        (:3000)
│   └── backend/           ← Hono API on Node, ESM               (:7090)
├── packages/
│   ├── auth/              ← Auth.js v5 credentials (phone + password)
│   ├── design-system/     ← shadcn/ui + Tailwind v4
│   ├── next-config/  seo/  storage/  internationalization/
│   └── typescript-config/ ← base.json (Node) / nextjs.json / react-library.json
├── biome.jsonc            ← ultracite preset
├── turbo.json
└── pnpm-workspace.yaml
```

## Path-scoped rules (auto-loaded)

| Rule | Triggers on |
|---|---|
| `rules/api-routes.md` | `apps/backend/src/routes/**` |
| `rules/services.md` | `apps/backend/src/services/**` |
| `rules/migrations.md` | `apps/backend/src/db/**` |
| `rules/types.md` | `apps/backend/src/types/**` |
| `rules/components.md` | `apps/app/app/**`, `packages/design-system/**`, `packages/auth/components/**` |
| `rules/packages.md` | `packages/**` |
| `rules/tests.md` | `**/*.test.*`, `**/*.spec.*` |
| `rules/async-*.md`, `rules/js-*.md` | always relevant (stack-agnostic JS/TS guidance) |

## Agents

| Agent | Use for |
|---|---|
| `migration-generator` | Drizzle schema changes + SQL migrations (MySQL) |
| `api-route-scaffolder` | New Hono routes, schemas, services in `apps/backend` |
| `integration-test-writer` | Vitest tests driving the Hono app via `app.request()` |
| `code-reviewer` | Pattern, correctness, and security review |
| `security-reviewer` | Focused security pass |
| `tdd-test-writer` / `tdd-implementer` | The TDD cycle |

## Skills

| Skill | Purpose |
|---|---|
| `/feature` | Research → plan → implement → verify |
| `/fix` | Understand → fix → test → verify |
| `/tdd` | Failing test → implement → refactor |
| `/refactor` | Analyse → plan → execute → verify |
| `/review` | Read → analyse → report |
| `/database-patterns` | Drizzle + MySQL conventions |
| `/commit-push-pr` | Commit, push, PR (user-invoked only) |
| `/autopilot-loop` | Autonomous delivery loop (user-invoked only) |

## When to update what

| Changed | Update |
|---|---|
| Backend route / service / schema | `rules/api-routes.md`, `rules/services.md`, `rules/migrations.md`, `skills/database-patterns` if the convention itself moved |
| Auth flow or middleware | `CLAUDE.md` → "Auth flow", `rules/integration-tests.md` → redirect matrix |
| New workspace package | `rules/packages.md`, this file |
| Env vars | `CLAUDE.md`, `apps/*/.env.example` |
| Stack or tooling | `CLAUDE.md`, `settings.json` permissions |
