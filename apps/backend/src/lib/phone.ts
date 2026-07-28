/**
 * Phone numbers arrive inconsistently (+998 90 766 17 70, 998907661770,
 * 998-90-766-17-70) and are stored and compared as bare digits.
 *
 * Must stay identical to packages/auth/lib/phone.ts — the web app normalizes
 * before POSTing here, and a mismatch would silently fail every login.
 */
export const normalizePhone = (phone: string): string =>
  phone.replace(/\D/g, "");
