---
title: Naming Conventions That Encode Intent
impact: MEDIUM
impactDescription: makes code self-documenting so the AI agent (and developers) can infer behavior from names alone
tags: naming, conventions, functions, variables, readability
paths:
  - "**/*.ts"
  - "**/*.tsx"
---

## Naming Conventions That Encode Intent

Function and variable names should tell you **what happens**, not just **what it is**. A name should encode the behavior, side effects, and failure mode so that reading the call site is enough to understand the code.

### Functions: Use Verb Patterns That Signal Behavior

| Pattern | Meaning | Example |
|---------|---------|---------|
| `fetchXOrThrow` | Fetches data, throws on failure | `fetchStudyOrThrow(id)` |
| `assertX` | Guard — throws if condition fails | `assertOrgAdmin(role)` |
| `ensureX` | Creates if missing, returns existing if present | `ensureDefaultProject(orgId)` |
| `tryX` | Attempts action, returns `null` on failure (no throw) | `tryParseJSON(body)` |
| `validateX` | Validates and returns errors (does not throw) | `validateStudyForm(values)` |
| `checkX` | Returns boolean — pure check, no side effects | `checkHasCredits(orgId, amount)` |
| `buildX` | Constructs and returns a new object | `buildQueryFilters(params)` |
| `formatX` | Transforms data for display | `formatDuration(seconds)` |
| `handleX` | Event handler (side effects expected) | `handleDeleteStudy(id)` |
| `onX` | Callback prop passed to a child component | `onStudyDeleted` |
| `useX` | React hook | `useStudyData(id)` |
| `withX` | HOC or wrapper that adds behavior | `withErrorHandler(handler)` |

### Incorrect — Generic Names

```ts
// What does "get" do on failure? Return null? Throw? Log?
function getStudy(id: string) { ... }

// What does "process" mean? Transform? Validate? Save?
function processData(input: unknown) { ... }

// What does "check" return? Boolean? Throws? NextResponse?
function check(req: Request) { ... }

// "handle" what exactly?
function handle(error: unknown) { ... }

// Does this validate or transform?
function parseInput(body: unknown) { ... }
```

### Correct — Intent-Encoding Names

```ts
// Clear: fetches or throws. Caller knows to expect an exception.
function fetchStudyOrThrow(id: string): Promise<Study> { ... }

// Clear: returns null on failure. Caller knows to null-check.
function tryParseJSON(body: string): unknown | null { ... }

// Clear: this is a guard. It throws if the condition fails.
function assertOrgAdmin(role: string): asserts role is "org:admin" { ... }

// Clear: returns boolean. No side effects.
function checkHasCredits(orgId: string, required: number): Promise<boolean> { ... }

// Clear: creates if missing, idempotent.
function ensureDefaultProject(orgId: string): Promise<Project> { ... }

// Clear: transforms for display.
function formatCreditBalance(credits: number): string { ... }
```

### Booleans: Use `is`, `has`, `can`, `should`

```ts
// Incorrect
const loading = true;
const admin = role === "org:admin";
const credits = balance > 0;

// Correct
const isLoading = true;
const isAdmin = role === "org:admin";
const hasCredits = balance > 0;
const canDeleteStudy = isAdmin || isOwner;
const shouldShowUpgrade = !hasCredits && isFreePlan;
```

### Collections: Always Plural

```ts
// Incorrect
const study = studies.map(...)   // "study" is singular but holds many
const item = data.filter(...)

// Correct
const studies = data.map(...)
const filteredStudies = studies.filter(...)
const studyIds = studies.map(s => s.id)
```

### Constants: UPPER_SNAKE_CASE for True Constants

```ts
// Config values, magic numbers, enum-like values
const MAX_RETRIES = 3;
const DEFAULT_PAGE_SIZE = 20;
const CREDIT_COST_PER_SESSION = 5;

// NOT for derived or runtime values — use camelCase
const totalCredits = sessions * CREDIT_COST_PER_SESSION;
```

## Why

- The AI agent reads function names to understand behavior without reading the implementation
- `OrThrow` vs `try` tells the agent whether to add error handling at the call site
- `assert` vs `check` tells the agent whether the function is a guard or a query
- Consistent boolean prefixes (`is`, `has`, `can`) make conditionals read like English
- Self-documenting code reduces the need for comments
