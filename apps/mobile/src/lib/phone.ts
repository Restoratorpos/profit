/**
 * Display formatting for a stored phone number.
 *
 * Numbers are stored and compared as **bare digits** everywhere in this system —
 * `packages/auth/lib/phone.ts` and `apps/backend/src/lib/phone.ts` both
 * normalize to them, and the two must stay identical. Grouping is display-only:
 * nothing formatted here is ever sent back or compared.
 *
 * This used to hand-roll the two dial codes it expected, deliberately avoiding
 * `@repo/auth`'s country table. That stopped being tenable once sign-in had to
 * **assemble** a number across the six countries rather than merely read one
 * back, so the table now lives in `./countries` and both sides use it.
 */

import { formatPhone } from "./countries";

/** `"998907661770"` → `"+998 90 766 17 70"`. Empty reads as a dash. */
export const formatPhoneDigits = (digits: string): string =>
  formatPhone(digits) || "—";
