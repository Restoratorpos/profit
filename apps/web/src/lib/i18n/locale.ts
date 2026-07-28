import { readDeviceCookie, setDeviceCookie } from "@/lib/device-prefs";
import { LOCALE_COOKIE, type Locale, resolveLocale } from "./config";

/**
 * The client-side replacement for the Next app's `lib/i18n/server.ts`.
 *
 * That module read the cookie during the server render so the first paint was
 * already in the right language. Reading it synchronously at boot achieves the
 * same thing: the locale is known before React mounts, so no render ever shows
 * the default and then swaps.
 */
export const getLocale = (): Locale =>
  resolveLocale(readDeviceCookie(LOCALE_COOKIE));

export const setLocale = (locale: Locale): void => {
  setDeviceCookie(LOCALE_COOKIE, locale);
};
