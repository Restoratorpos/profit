/**
 * A deliberately tiny locale layer for the app shell.
 *
 * This is NOT a substitute for a real i18n library — it exists so the language
 * switcher does something honest instead of being a dead control. When the app
 * grows past shell chrome, replace it with `next-intl` (see
 * `.claude/rules/frontend/i18n-patterns.md`); the cookie and the locale codes
 * carry over unchanged.
 */

export const LOCALES = [
  { code: "uz", short: "UZ", label: "O'zbekcha" },
  { code: "ru", short: "RU", label: "Русский" },
  { code: "en", short: "EN", label: "English" },
] as const;

export type Locale = (typeof LOCALES)[number]["code"];

export const DEFAULT_LOCALE: Locale = "uz";

/** Device-scoped, like the sidebar and theme cookies. */
export const LOCALE_COOKIE = "profit-locale";

export const isLocale = (value: string | undefined): value is Locale =>
  LOCALES.some((locale) => locale.code === value);

export const resolveLocale = (value: string | undefined): Locale =>
  isLocale(value) ? value : DEFAULT_LOCALE;
