/** Mirrors what apps/backend returns from /workers. */

import { formatDate, toDateInput } from "@/lib/date";
import type { MessageKey } from "@/lib/i18n/dictionary";

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

/**
 * Auth roles this screen can **show but never assign**.
 *
 * `role` carries two vocabularies: the auth roles the backend signs into a
 * token, and the positions above. Owner and admin exist only in the first, so
 * the picker cannot offer them — but the table still has to render them, or the
 * gym's owner appears in the roster as "Boshqa", which is what happens when a
 * label lookup falls through instead of failing.
 */
export const UNASSIGNABLE_ROLES = ["owner", "admin"] as const;

export const isUnassignableRole = (role: string | null | undefined): boolean =>
  UNASSIGNABLE_ROLES.some((value) => value === role);

/** Everything that has a label, whether or not it can be chosen. */
const LABELLED_ROLES: readonly string[] = [
  ...WORKER_POSITIONS,
  ...UNASSIGNABLE_ROLES,
];

/** The message key for a role label, e.g. "workers.posTrainer". */
export const positionLabelKey = (position: string | null): MessageKey => {
  const known = LABELLED_ROLES.find((value) => value === position);

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

/**
 * `"16 soat 48 daq"` from a minute count — worked time, in the reader's
 * language. This used to print a hard-coded `"16h 48m"` here; hours are read by
 * the same person as the dates beside them, so they come from the same table.
 */
export { formatDuration } from "@/lib/date";

export const RANGE_PRESETS = [
  "all-time",
  "this-month",
  "last-month",
  "last-30",
  "custom",
] as const;

export type RangePreset = (typeof RANGE_PRESETS)[number];

/**
 * Where "all time" starts.
 *
 * A fixed date rather than an open-ended query, because the range is what every
 * figure on the staff table is computed over — `earnedOver` prorates a monthly
 * salary across the days in range, so an unbounded start would accrue wages
 * back to the epoch and turn every balance into nonsense. This is the date the
 * gym's books begin.
 */
export const ALL_TIME_START = "2026-01-01";

/** `"YYYY-MM-DD"` from a Date, local time. */
export { toDateInput } from "@/lib/date";

/**
 * The [from, to] a preset selects, as "YYYY-MM-DD" bounds. `custom` returns
 * empty bounds — the caller supplies its own dates.
 */
export const rangeForPreset = (
  preset: RangePreset,
  now = new Date()
): { from: string; to: string } => {
  if (preset === "all-time") {
    return { from: ALL_TIME_START, to: toDateInput(now) };
  }

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

/** `"8 iyul, 12:31"` — a compact attendance stamp. */
export { formatStamp } from "@/lib/date";

/** `"2026-06-15"` shown as `"15 iyun, 2026"`, or a dash. */
export const formatDay = formatDate;

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

/** `"iyul 2026"` — how a `"2026-07"` period reads on screen. */
export { formatMonth } from "@/lib/date";

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

/** How a preset reads on screen. Shared by the staff table and the history drawer. */
export const RANGE_LABEL: Record<RangePreset, MessageKey> = {
  "all-time": "workers.rangeAllTime",
  "this-month": "workers.rangeThisMonth",
  "last-month": "workers.rangeLastMonth",
  "last-30": "workers.rangeLast30",
  custom: "workers.rangeCustom",
};

/** The label for a till, matching the three buttons the pay window offers. */
export const salaryMethodLabelKey = (method: string): MessageKey => {
  if (method === "card") {
    return "workers.payCard";
  }

  if (method === "transfer") {
    return "workers.payTransfer";
  }

  return "workers.payCash";
};

/** One wage handed over, as the salary-history drawer lists it. */
export interface SalaryHistoryRow {
  amount: string;
  id: number;
  method: string;
  note: string | null;
  /** When the money moved — not the month it settles. */
  paidAt: string | null;
  /** "YYYY-MM", or null for a wage typed on the cashbox screen. */
  period: string | null;
  workerId: string | null;
  workerName: string | null;
}

/** Mirrors the backend's `SalaryHistoryPage`. */
export interface SalaryHistoryPage {
  /** Everyone who has ever been paid — the worker filter's options. */
  options: { id: string; name: string }[];
  rows: SalaryHistoryRow[];
  /** Rows matching the filter, not just this page. */
  total: number;
  /** What those rows add up to, over the whole filter. */
  totalAmount: string;
}

/**
 * "Everyone" — the worker filter's default.
 *
 * A sentinel rather than an empty string because Radix's `Select` reserves `""`
 * for "nothing is chosen" and throws on an item that uses it. The query builder
 * translates it back to "send no workerId at all".
 */
export const ALL_WORKERS = "all";

export interface SalaryHistoryQuery {
  page: number;
  pageSize: number;
  workerId: string;
}

export const DEFAULT_SALARY_HISTORY_QUERY: SalaryHistoryQuery = {
  page: 1,
  pageSize: 25,
  workerId: ALL_WORKERS,
};
