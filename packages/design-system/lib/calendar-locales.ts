/**
 * The date-fns locales a calendar in this design system can be written in.
 *
 * Re-exported from here so a consuming app does not need `date-fns` of its own.
 * The calendar and its date library are this package's, and under pnpm's
 * non-hoisted layout an app that imports `date-fns/locale` without declaring the
 * dependency simply fails to resolve it.
 *
 * `uz` is Latin Uzbek. `uzCyrl` also exists in date-fns and is deliberately not
 * offered: Cyrillic month names under a Latin interface read as a bug.
 */

export type { Locale } from "date-fns";
export { enUS, ru, uz } from "date-fns/locale";
