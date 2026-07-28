export interface BranchOption {
  id: string;
  name: string;
}

/** Device-scoped: a terminal lives in one branch. */
export const BRANCH_COOKIE = "profit-branch";

/**
 * PLACEHOLDER — not real data.
 *
 * The real list is `SELECT branch_id, branch FROM branches WHERE gym_id = ?`,
 * which needs the caller's `gym_id`. The backend already puts `gymId` on its
 * own access token, but the **web session does not carry it**: widening
 * `/auth/verify` means editing `packages/auth/lib/verify-credentials.ts`, and
 * the `Read(./**\/*credential*)` deny rule in `.claude/settings.json` currently
 * blocks that file.
 *
 * So this stays a stub until either that glob is narrowed, or the app gets a
 * `/api/branches` route that calls the backend server-side. Everything else
 * about the switcher — the cookie, the selection, the re-render — is real and
 * will not change when the data does.
 */
export const PLACEHOLDER_BRANCHES: readonly BranchOption[] = [
  { id: "placeholder-main", name: "Main" },
] as const;
