/**
 * Number and date formatting, hand-rolled.
 *
 * The desk app uses `Intl.NumberFormat` and `Intl.DateTimeFormat`. Here we do
 * not: Hermes ships a cut-down ICU and what it supports differs between Android
 * and iOS, so an `Intl` call that reads correctly in the simulator can come back
 * unformatted — or throw — on a real Android phone. Money on a manager's screen
 * is the last place to accept that, and grouping digits is ten lines.
 */

/** `1234567` → `"1 234 567"`. Space-grouped, the way the desk shows so'm. */
const group = (digits: string): string => {
  const length = digits.length;
  let out = "";

  for (let i = 0; i < length; i++) {
    // Count from the right: insert a gap every third digit, never leading.
    const fromEnd = length - i;

    out += digits.charAt(i);

    if (fromEnd > 1 && (fromEnd - 1) % 3 === 0) {
      out += " ";
    }
  }

  return out;
};

/**
 * The API sends money as decimal strings (`"1250000.00"`).
 *
 * Cents are dropped rather than rounded to two places: UZS has no subunit in
 * practice, and `.00` on every tile is nine characters of noise. Anything that
 * needs the exact stored figure should read the raw string, not this.
 */
export const formatMoney = (value: string | number | null): string => {
  const amount = Number(value ?? 0);

  if (!Number.isFinite(amount)) {
    return "0";
  }

  const whole = Math.trunc(Math.abs(amount));
  const sign = amount < 0 ? "-" : "";

  return `${sign}${group(String(whole))}`;
};

/** Grouped, but shortened past a million — for a tile that must not wrap. */
export const formatCompact = (value: string | number | null): string => {
  const amount = Number(value ?? 0);

  if (!Number.isFinite(amount)) {
    return "0";
  }

  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";

  if (abs >= 1_000_000) {
    return `${sign}${trimZero(abs / 1_000_000)}M`;
  }

  if (abs >= 10_000) {
    return `${sign}${trimZero(abs / 1000)}K`;
  }

  return formatMoney(amount);
};

const trimZero = (value: number): string => {
  const fixed = value.toFixed(1);

  return fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
};

/** Stock reads as a plain count: `"1.65"`, `"40"` — never `"40.000"`. */
export const formatQuantity = (value: string | number | null): string => {
  const amount = Number(value ?? 0);

  if (!Number.isFinite(amount)) {
    return "0";
  }

  return String(Math.round(amount * 1000) / 1000);
};

/**
 * The change from the window before, as a whole percent.
 *
 * Null when the previous window was zero — "up from nothing" has no percentage,
 * and showing +100% (or ∞) is a number a manager would act on.
 */
export const changeFrom = (
  current: string | number,
  previous: string | number
): number | null => {
  const before = Number(previous);
  const now = Number(current);

  if (!(Number.isFinite(before) && Number.isFinite(now)) || before === 0) {
    return null;
  }

  return Math.round(((now - before) / Math.abs(before)) * 100);
};

const pad = (value: number): string => String(value).padStart(2, "0");

/** `"2026-08-02T09:14:00Z"` → `"09:14"`, in the phone's own zone. */
export const formatTime = (value: string | null): string => {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/** `"2026-08-02"` → `"02.08.2026"`. Day-first, as everything else here is. */
export const formatDay = (value: string | null): string => {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
};

/** `"02.08 · 09:14"` — what an attendance row needs on one line. */
export const formatMoment = (value: string | null): string => {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)} · ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
};

/** Whole days from now until `value`. Negative once it has passed. */
export const daysUntil = (value: string | null): number | null => {
  if (!value) {
    return null;
  }

  const then = new Date(value);

  if (Number.isNaN(then.getTime())) {
    return null;
  }

  const MS_PER_DAY = 86_400_000;
  const midnight = new Date();

  midnight.setHours(0, 0, 0, 0);

  return Math.round((then.getTime() - midnight.getTime()) / MS_PER_DAY);
};

/** Worked minutes → `"7h 30m"`. Zero is `"—"`, not `"0h 0m"`. */
export const formatMinutes = (minutes: number): string => {
  if (!(Number.isFinite(minutes) && minutes > 0)) {
    return "—";
  }

  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);

  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
};

/** Any run of whitespace. Hoisted: this runs once per row of every list. */
const WHITESPACE = /\s+/;

/** `"Aziz Karimov"` → `"AK"`. One letter when there is only one word. */
export const initialsOf = (name: string): string => {
  const words = name.trim().split(WHITESPACE).filter(Boolean);

  if (words.length === 0) {
    return "?";
  }

  const first = words[0]?.charAt(0) ?? "";
  const second = words.length > 1 ? (words.at(-1)?.charAt(0) ?? "") : "";

  return (first + second).toUpperCase();
};

/**
 * An ISO instant `days` before the start of today, and the end of today.
 *
 * Both ends are absolute instants because `/attendance/sessions` validates them
 * with `new Date(value)` — a bare `YYYY-MM-DD` would be read as UTC midnight and
 * silently shift the window by the phone's offset.
 */
export const rangeOf = (days: number): { from: string; to: string } => {
  const MS_PER_DAY = 86_400_000;
  const start = new Date();

  start.setHours(0, 0, 0, 0);

  const from = new Date(start.getTime() - (days - 1) * MS_PER_DAY);
  const to = new Date(start.getTime() + MS_PER_DAY);

  return { from: from.toISOString(), to: to.toISOString() };
};
