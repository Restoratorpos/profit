/**
 * Payroll periods.
 *
 * A wage is earned in one month and very often handed over in the next — July's
 * salary paid on 3 August. `expenses.paid_at` records when the money left the
 * till, which is what the cashbox needs and what a cashflow report reads; it
 * says nothing about which month the payment settles. Recorded on `paid_at`
 * alone, that August payment would leave July looking unpaid forever and August
 * looking overpaid.
 *
 * So the month rides alongside it, in `expenses.action_id`, as `salary:YYYY-MM`.
 *
 * That column is reused rather than a new one added because the live `gyms`
 * database is remote, shared and has no migration baseline (see
 * `drizzle/README.md`) — a targeted ALTER against it is a bigger decision than
 * this feature warrants. `action_id` is only ever read per category: /inventory
 * reads it on `supplier` rows to settle a delivery, the cashbox on `cash_move`
 * rows to find the other half of a transfer, and neither looks at a `salary`
 * one. The prefix keeps the two meanings apart on sight.
 */

export const SALARY_CATEGORY = "salary";

const SALARY_PERIOD_PREFIX = "salary:";

/** `YYYY-MM`. Anchored, so `2026-13` and `2026-7` are both rejected. */
export const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** What goes in `expenses.action_id` for a wage paid against `period`. */
export const salaryPeriodTag = (period: string): string =>
  `${SALARY_PERIOD_PREFIX}${period}`;

/**
 * The `YYYY-MM` a salary expense settles, or null when the row carries none —
 * a wage typed on the cashbox screen, or one recorded before periods existed.
 */
export const salaryPeriodOf = (actionId: string | null): string | null => {
  if (!actionId?.startsWith(SALARY_PERIOD_PREFIX)) {
    return null;
  }

  const period = actionId.slice(SALARY_PERIOD_PREFIX.length);

  return PERIOD_PATTERN.test(period) ? period : null;
};

/** The `YYYY-MM` a date falls in, in local time — the desk's own calendar. */
export const monthKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
};

const partsOf = (period: string): { month: number; year: number } => {
  const [year, month] = period.split("-");

  return { month: Number(month), year: Number(year) };
};

/** The whole calendar month a period names, first instant to last. */
export const monthRange = (period: string): { from: Date; to: Date } => {
  const { month, year } = partsOf(period);

  return {
    from: new Date(year, month - 1, 1),
    to: new Date(year, month, 0, 23, 59, 59, 999),
  };
};

export const daysInMonth = (period: string): number => {
  const { month, year } = partsOf(period);

  return new Date(year, month, 0).getDate();
};

/**
 * A generous ceiling on how many months one query may span. The range picker
 * offers a month at a time, so this only ever bites a hand-typed custom range,
 * where it is a bound on the `IN` list rather than a real limit.
 */
const MAX_MONTHS = 240;

/** Every `YYYY-MM` the range touches, in order, ends included. */
export const monthsInRange = (from: Date, to: Date): string[] => {
  if (to < from) {
    return [];
  }

  const months: string[] = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), 1);

  while (cursor <= to && months.length < MAX_MONTHS) {
    months.push(monthKey(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
};

/** Local midnight — the granularity every day count here works in. */
const startOfDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const MS_PER_DAY = 86_400_000;

/**
 * How many days of `period` fall inside [from, to] and on or after `since`.
 *
 * This is what prorates a monthly salary: a full month covered returns the
 * month's length, so the arithmetic below hands back the whole salary, and a
 * worker hired on the 20th is only owed for the days they were employed.
 */
export const coveredDaysOfMonth = (
  period: string,
  range: { from: Date; to: Date },
  since: Date | null
): number => {
  const month = monthRange(period);
  const start = startOfDay(
    [month.from, range.from, since ?? month.from].reduce((latest, candidate) =>
      candidate > latest ? candidate : latest
    )
  );
  const end = startOfDay(month.to < range.to ? month.to : range.to);

  if (end < start) {
    return 0;
  }

  return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
};
