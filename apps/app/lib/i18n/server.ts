import "server-only";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, type Locale, resolveLocale } from "./config";

/**
 * Read on the server so the first paint is already in the right language.
 * Doing this client-side would render the default locale and then swap — the
 * same flash the theme setup exists to avoid.
 */
export const getLocale = async (): Promise<Locale> => {
  const store = await cookies();

  return resolveLocale(store.get(LOCALE_COOKIE)?.value);
};
