/** The wire shapes of `GET /gym`, `PATCH /gym` and `PATCH /auth/password`. */

export interface GymBranch {
  id: string;
  name: string;
}

export interface GymSettings {
  /** Every branch the gym has, oldest first — what the header's picker lists. */
  branches: readonly GymBranch[];
  /** Whose opening hours these are. Null only for a tenant with no branch row. */
  branchId: string | null;
  branchName: string | null;
  /** "HH:MM", or null when the gym has not published its hours. */
  closeTime: string | null;
  id: string;
  name: string;
  openTime: string | null;
  ownerName: string | null;
  phone: string | null;
  planTier: string | null;
}

/**
 * Partial on purpose: the backend distinguishes an absent field ("leave it")
 * from `null` ("clear it"), so the form only sends what it edits.
 */
export interface GymSettingsInput {
  closeTime?: string | null;
  name?: string;
  openTime?: string | null;
}

export interface PasswordChange {
  currentPassword: string;
  newPassword: string;
}

/** What the time pickers open on for a gym that has never set its hours. */
export const DEFAULT_OPEN_TIME = "08:00";
export const DEFAULT_CLOSE_TIME = "22:00";

/** Matches the backend's own bound; bcrypt truncates past 72 bytes. */
export const MIN_PASSWORD_LENGTH = 4;
export const MAX_PASSWORD_LENGTH = 72;
