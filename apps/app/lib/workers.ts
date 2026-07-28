/** Mirrors what apps/backend returns from /workers. */

import type { Locale } from "./i18n/config";
import type { MessageKey } from "./i18n/dictionary";

export interface WorkerListItem {
  /** `earned` minus `paid`. Null whenever `earned` is. */
  balance: string | null;
  /**
   * Earned over the active range. Null for a monthly salary — see the backend's
   * `WorkerListItem.earned`; the rule for what a month part-worked is worth has
   * not been decided, and a guess here would become a wrong `balance`.
   */
  earned: string | null;
  /** True when a face is enrolled on at least one terminal. */
  hasFace: boolean;
  /** "YYYY-MM-DD" or null. */
  hiredAt: string | null;
  id: string;
  isActive: boolean;
  /** Worked minutes in the active range; an open shift counts up to now. */
  minutesWorked: number;
  name: string;
  onShiftNow: boolean;
  /** ISO instant of the open shift's check-in, or null. */
  openSince: string | null;
  /** Salary actually paid out over the active range. */
  paid: string;
  phone: string | null;
  role: string | null;
  /** Decimal string. Per hour when salaryType is "hourly", else per month. */
  salaryAmount: string;
  salaryType: string;
  /** "HH:MM" or null. */
  shiftEnd: string | null;
  shiftStart: string | null;
  /** ISO weekday numbers, 1 (Mon) … 7 (Sun). */
  workingDays: number[];
}

export interface AttendanceSessionView {
  checkIn: string | null;
  checkOut: string | null;
  id: number;
  minutesWorked: number;
  open: boolean;
}

export interface WorkerDetail {
  sessionCount: number;
  sessions: AttendanceSessionView[];
  totalMinutes: number;
  worker: WorkerListItem;
}

/** What the detail Server Action hands back — a "use server" module can only export async functions. */
export interface WorkerDetailResult {
  detail?: WorkerDetail;
  error?: string;
  ok: boolean;
}

export const WORKER_POSITIONS = [
  "manager",
  "trainer",
  "receptionist",
  "cleaner",
  "guard",
  "other",
] as const;

export type WorkerPosition = (typeof WORKER_POSITIONS)[number];

/** The message key for a position label, e.g. "workers.posTrainer". */
export const positionLabelKey = (position: string | null): MessageKey => {
  const known = WORKER_POSITIONS.find((value) => value === position);

  if (!known) {
    return "workers.posOther";
  }

  const suffix = known.charAt(0).toUpperCase() + known.slice(1);

  return `workers.pos${suffix}` as MessageKey;
};

export const WORKER_SALARY_TYPES = ["monthly", "hourly"] as const;

export type WorkerSalaryType = (typeof WORKER_SALARY_TYPES)[number];

/** The seven working-day toggles, each mapping to its `plans.dayN` label. */
export const WEEKDAYS: readonly { day: number; labelKey: MessageKey }[] = [
  { day: 1, labelKey: "plans.day1" },
  { day: 2, labelKey: "plans.day2" },
  { day: 3, labelKey: "plans.day3" },
  { day: 4, labelKey: "plans.day4" },
  { day: 5, labelKey: "plans.day5" },
  { day: 6, labelKey: "plans.day6" },
  { day: 7, labelKey: "plans.day7" },
];

/** `"16h 48m"` from a minute count — the way hours read on the table. */
export const formatHours = (minutes: number): string => {
  const whole = Math.max(0, Math.round(minutes));
  const hours = Math.floor(whole / 60);
  const mins = whole % 60;

  return `${hours}h ${mins}m`;
};

export const RANGE_PRESETS = [
  "this-month",
  "last-month",
  "last-30",
  "custom",
] as const;

export type RangePreset = (typeof RANGE_PRESETS)[number];

/** `"YYYY-MM-DD"` from a Date, local time. */
export const toDateInput = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

/**
 * The [from, to] a preset selects, as "YYYY-MM-DD" bounds. `custom` returns
 * empty bounds — the caller supplies its own dates.
 */
export const rangeForPreset = (
  preset: RangePreset,
  now = new Date()
): { from: string; to: string } => {
  if (preset === "last-month") {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth(), 0);

    return { from: toDateInput(from), to: toDateInput(to) };
  }

  if (preset === "last-30") {
    const from = new Date(now);

    from.setDate(from.getDate() - 29);

    return { from: toDateInput(from), to: toDateInput(now) };
  }

  if (preset === "custom") {
    return { from: "", to: "" };
  }

  // this-month
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  return { from: toDateInput(from), to: toDateInput(to) };
};

const LOCALE_TAG: Record<Locale, string> = {
  uz: "uz-UZ",
  ru: "ru-RU",
  en: "en-US",
};

const parseDate = (value: string | null): Date | null => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/** `"Jul 08, 12:31"` — a compact attendance stamp. */
export const formatStamp = (value: string | null, locale: Locale): string => {
  const parsed = parseDate(value);

  if (!parsed) {
    return "—";
  }

  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
};

/** `"2026-06-15"` shown as a short local date, or a dash. */
export const formatDay = (value: string | null, locale: Locale): string => {
  const parsed = parseDate(value);

  if (!parsed) {
    return "—";
  }

  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(parsed);
};

/** Bare initial for the avatar stand-in. */
export const initialOf = (name: string): string =>
  name.trim().charAt(0).toUpperCase() || "?";

/** Which slice of the staff list is showing. */
export const WORKER_FILTERS = [
  "active",
  "on-shift",
  "inactive",
  "all",
] as const;

export type WorkerFilter = (typeof WORKER_FILTERS)[number];

/** What the list screen asks the backend for. */
export interface WorkerQuery {
  page: number;
  pageSize: number;
  query: string;
  status: WorkerFilter;
}

export const DEFAULT_WORKER_QUERY: WorkerQuery = {
  page: 1,
  pageSize: 25,
  query: "",
  status: "active",
};

/**
 * The tills a wage can come out of — the same three /inventory pays a supplier
 * from. `debt` and `free` are absent because neither moves money, and a wage
 * that was not handed over is not a payment.
 */
export const SALARY_METHODS = ["cash", "card", "transfer"] as const;

export type SalaryMethod = (typeof SALARY_METHODS)[number];

/** One wage already handed over, as the pay window lists it back. */
export interface SalaryPaymentView {
  amount: string;
  id: number;
  method: string;
  note: string | null;
  /** When the money moved — not the month it settles. */
  paidAt: string | null;
  /** "YYYY-MM", or null for a wage typed on the cashbox screen. */
  period: string | null;
}

/** Mirrors the backend's `WorkerPayroll`: one worker, one month. */
export interface WorkerPayroll {
  /**
   * Earned up to today, when that differs from `earned` — a monthly salary in
   * a month still running. Null for an hourly wage and for a finished month.
   */
  accrued: string | null;
  earned: string | null;
  minutesWorked: number;
  paid: string;
  payments: SalaryPaymentView[];
  period: string;
  /** `earned` minus `paid`: what is still to hand over. */
  remaining: string | null;
  worker: WorkerListItem;
}

/** What the payroll Server Action hands back. */
export interface WorkerPayrollResult {
  error?: string;
  ok: boolean;
  payroll?: WorkerPayroll;
}

/** What a wage payment sends. `period` is the month it settles. */
export interface SalaryPaymentInput {
  amount: string;
  method: SalaryMethod;
  note?: string;
  period: string;
}

/** The "YYYY-MM" a date falls in, local time. */
export const monthKeyOf = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
};

const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The month a "YYYY-MM-DD" bound sits in, falling back to the current one. */
export const monthOfDate = (value: string, now = new Date()): string => {
  const month = value.slice(0, 7);

  return PERIOD_PATTERN.test(month) ? month : monthKeyOf(now);
};

const MONTHS_BACK = 11;

/**
 * The months the pay window offers, newest first: next month through the last
 * year. Next month is there because wages are sometimes paid in advance, and a
 * year back because a forgotten month is exactly the one somebody comes back to
 * settle.
 */
export const monthOptions = (now = new Date()): string[] => {
  const months: string[] = [];

  for (let offset = 1; offset >= -MONTHS_BACK; offset -= 1) {
    months.push(
      monthKeyOf(new Date(now.getFullYear(), now.getMonth() + offset, 1))
    );
  }

  return months;
};

/** `"July 2026"` — how a period reads on screen. */
export const formatMonth = (period: string, locale: Locale): string => {
  const [year, month] = period.split("-").map(Number);

  if (!(year && month)) {
    return period;
  }

  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    year: "numeric",
    month: "long",
  }).format(new Date(year, month - 1, 1));
};

export type WorkerCounts = Record<WorkerFilter, number>;

/**
 * One page of the staff list. Search, filtering and paging happen in
 * apps/backend, so these counts are its tally over the whole list rather than
 * something this app can recompute from `rows`.
 */
export interface WorkerPage {
  counts: WorkerCounts;
  rows: WorkerListItem[];
  total: number;
}
