const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Preferences that belong to the machine, not the account — branch, locale,
 * sidebar state.
 *
 * Still cookies rather than localStorage, for two reasons: the design system's
 * own `SidebarProvider` persists `sidebar_state` as a cookie and nothing else,
 * so reading anywhere else would miss it; and when this app is served from the
 * same origin as the API these are already attached to every request if the
 * backend ever wants them.
 */
export const setDeviceCookie = (name: string, value: string): void => {
  // biome-ignore lint/suspicious/noDocumentCookie: the CookieStore API it wants is unavailable in Safari and in Electron's older Chromium, and this has to work on whatever the front desk runs.
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
};

/**
 * Read at boot to pick the shell's initial state.
 *
 * In the Next app this was `cookies()` on the server, so the first paint was
 * already correct. Here it runs before React renders, which gets the same
 * result — the value is known synchronously, so there is still no flash.
 */
export const readDeviceCookie = (name: string): string | undefined => {
  const match = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${name}=`));

  if (!match) {
    return;
  }

  return decodeURIComponent(match.slice(name.length + 1));
};
