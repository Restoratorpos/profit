const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Writes a preference that belongs to the machine, not the account — branch,
 * locale, sidebar state. Read back on the server so the first paint is already
 * correct.
 */
export const setDeviceCookie = (name: string, value: string): void => {
  // biome-ignore lint/suspicious/noDocumentCookie: the CookieStore API it wants is unavailable in Safari and in Electron's older Chromium, and this has to work on whatever the front desk runs.
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
};
