/**
 * Phone numbers are entered inconsistently (+998 90 766 17 70, 998907661770,
 * 998-90-766-17-70). Everything downstream compares them as bare digits.
 */
export const normalizePhone = (phone: string): string =>
  phone.replace(/\D/g, "");
