/**
 * Dates as the front desk reads them: `"8 mart, 2026"`.
 *
 * The month names are written out here rather than left to
 * `Intl.DateTimeFormat`, because ICU has no Uzbek month data: `uz-UZ` renders
 * August as **"M08"** and puts the year first, so the orders list showed
 * `"2026 M08 3 08:12"` — a stamp nobody at a desk can read. `en-GB` was the
 * other half of the same problem: several screens hard-coded it and printed
 * English months into an Uzbek UI.
 *
 * One shape everywhere, in every language:
 *
 * | helper | output |
 * |---|---|
 * | `formatDay` | `8 mart` |
 * | `formatDate` | `8 mart, 2026` |
 * | `formatDateTime` | `8 mart, 2026 08:12` |
 * | `formatStamp` | `8 mart, 08:12` |
 * | `formatTime` | `08:12` |
 * | `formatMonth` | `mart 2026` |
 * | `formatDuration` | `3 soat 20 daq` |
 *
 * The clock is always 24-hour: this is a terminal on a counter, not a phone.
 */

import type { Locale } from "./i18n/config";

export type DateInput = Date | string | null | undefined;

/**
 * Genitive in Russian — a day needs `"8 марта"`, not `"8 март"`. Uzbek and
 * English do not inflect, so they share one list with {@link MONTHS}.
 */
const MONTHS_WITH_DAY: Record<Locale, readonly string[]> = {
  uz: [
    "yanvar",
    "fevral",
    "mart",
    "aprel",
    "may",
    "iyun",
    "iyul",
    "avgust",
    "sentabr",
    "oktabr",
    "noyabr",
    "dekabr",
  ],
  ru: [
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
  ],
  en: [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ],
};

/** Nominative — how a month names itself, for `"avgust 2026"` headings. */
const MONTHS: Record<Locale, readonly string[]> = {
  uz: MONTHS_WITH_DAY.uz,
  ru: [
    "январь",
    "февраль",
    "март",
    "апрель",
    "май",
    "июнь",
    "июль",
    "август",
    "сентябрь",
    "октябрь",
    "ноябрь",
    "декабрь",
  ],
  en: MONTHS_WITH_DAY.en,
};

/** What every helper here shows when there is no date to show. */
export const NO_DATE = "—";

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

const MONTH_ONLY = /^\d{4}-\d{2}$/;

/**
 * A `Date`, or `null` for anything unparseable — including `""`, which `new
 * Date("")` turns into `Invalid Date` rather than throwing.
 *
 * A bare `"2026-07-12"` is read **field by field**, not through
 * `new Date(value)`: the spec reads a date-only string as UTC midnight, which
 * renders as the 11th anywhere west of Greenwich. Tashkent is UTC+5 and would
 * survive it; nothing guarantees the next terminal is.
 */
export const toDate = (value: DateInput): Date | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const dateOnly = DATE_ONLY.exec(value);

  if (dateOnly) {
    return new Date(
      Number(dateOnly[1]),
      Number(dateOnly[2]) - 1,
      Number(dateOnly[3])
    );
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const clock = (date: Date): string =>
  `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;

const dayOf = (date: Date, locale: Locale): string =>
  `${date.getDate()} ${MONTHS_WITH_DAY[locale][date.getMonth()]}`;

/** `"8 mart"` — a day inside a period the screen has already named. */
export const formatDay = (value: DateInput, locale: Locale): string => {
  const date = toDate(value);

  return date ? dayOf(date, locale) : NO_DATE;
};

/** `"8 mart, 2026"` — the default. Reach for this unless a row is cramped. */
export const formatDate = (value: DateInput, locale: Locale): string => {
  const date = toDate(value);

  return date ? `${dayOf(date, locale)}, ${date.getFullYear()}` : NO_DATE;
};

/** `"8 mart, 2026 08:12"` — the day and the clock, in full. */
export const formatDateTime = (value: DateInput, locale: Locale): string => {
  const date = toDate(value);

  return date
    ? `${dayOf(date, locale)}, ${date.getFullYear()} ${clock(date)}`
    : NO_DATE;
};

/**
 * `"8 mart, 08:12"` — the year dropped, for logs and history lists where every
 * row is recent and the column is narrow.
 */
export const formatStamp = (value: DateInput, locale: Locale): string => {
  const date = toDate(value);

  return date ? `${dayOf(date, locale)}, ${clock(date)}` : NO_DATE;
};

/** `"08:12"` — 24-hour, local. */
export const formatTime = (value: DateInput): string => {
  const date = toDate(value);

  return date ? clock(date) : NO_DATE;
};

/**
 * `"avgust 2026"` from a `Date`, an ISO string, or a bare `"2026-08"` period —
 * which is what the salary screens hold.
 */
export const formatMonth = (value: DateInput, locale: Locale): string => {
  if (typeof value === "string" && MONTH_ONLY.test(value)) {
    const [year, month] = value.split("-").map(Number);

    return `${MONTHS[locale][month - 1]} ${year}`;
  }

  const date = toDate(value);

  return date
    ? `${MONTHS[locale][date.getMonth()]} ${date.getFullYear()}`
    : NO_DATE;
};

/**
 * How long something took, in the reader's language.
 *
 * `"65h 30m"` was hard-coded English on every screen that showed worked hours —
 * the same bug the month table above exists to prevent, one unit smaller. The
 * units are abbreviated because they sit in table cells: Russian in particular
 * would need three plural forms of `час` spelled out, and `ч` needs none.
 */
const DURATION_UNITS: Record<
  Locale,
  { gap: string; hour: string; minute: string }
> = {
  uz: { gap: " ", hour: "soat", minute: "daq" },
  ru: { gap: " ", hour: "ч", minute: "мин" },
  /* English abbreviations attach to the number: "65h 30m", not "65 h 30 m". */
  en: { gap: "", hour: "h", minute: "m" },
};

export interface DurationParts {
  /** What separates a number from its unit — nothing at all in English. */
  gap: string;
  hours: number;
  hourUnit: string;
  minutes: number;
  minuteUnit: string;
}

/**
 * A minute count split into whole hours and the remainder, with the unit words
 * to print beside each — for the places that set the number and its unit in
 * different sizes rather than printing one string.
 */
export const durationParts = (
  minutes: number,
  locale: Locale
): DurationParts => {
  const whole = Math.max(0, Math.round(minutes));
  const units = DURATION_UNITS[locale];

  return {
    gap: units.gap,
    hours: Math.floor(whole / 60),
    hourUnit: units.hour,
    minutes: whole % 60,
    minuteUnit: units.minute,
  };
};

/**
 * `"65 soat 30 daq"` / `"65 ч 30 мин"` / `"65h 30m"` from a minute count.
 *
 * A zero part is dropped once another carries the value — `"3 soat"` rather
 * than `"3 soat 0 daq"` — but a shift under an hour still reads in minutes, and
 * a range with no work in it reads `"0 daq"` rather than blank.
 */
export const formatDuration = (minutes: number, locale: Locale): string => {
  const parts = durationParts(minutes, locale);
  const hours = `${parts.hours}${parts.gap}${parts.hourUnit}`;
  const mins = `${parts.minutes}${parts.gap}${parts.minuteUnit}`;

  if (parts.hours === 0) {
    return mins;
  }

  if (parts.minutes === 0) {
    return hours;
  }

  return `${hours} ${mins}`;
};

/** `"YYYY-MM-DD"` in local time — the value a date input holds, not a label. */
export const toDateInput = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
