import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db/index.js";
import {
  attendanceEvents,
  attendanceSessions,
  branches,
  credentials,
  expenses,
  gyms,
  ID_LENGTH,
  workers,
} from "../db/schema.js";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from "../lib/errors.js";
import {
  coveredDaysOfMonth,
  daysInMonth,
  monthKey,
  monthRange,
  monthsInRange,
  SALARY_CATEGORY,
  salaryPeriodOf,
  salaryPeriodTag,
} from "../lib/payroll.js";
import type {
  AttendanceMarkInput,
  CreateWorkerInput,
  PayWorkerInput,
  SalaryHistoryQueryInput,
  UpdateWorkerInput,
  WorkerQueryInput,
} from "../schemas/worker.js";

/** Every query filters by gymId. An unscoped one is a data leak, not a bug. */

export interface WorkerListItem {
  /**
   * `earned` minus `paid` — what is still owed, or what was overpaid when it
   * comes out negative. Null only when `earned` is.
   */
  balance: string | null;
  /**
   * What the worker has earned over the range: worked hours times the rate for
   * an hourly wage, the month's salary prorated by the days of it in range for
   * a monthly one. See `earnedOver` for why those two rules and not others.
   *
   * Null is reserved for a salary figure that cannot be read as a number at all.
   */
  earned: string | null;
  /** True when a face is enrolled on at least one terminal. */
  hasFace: boolean;
  hiredAt: string | null;
  id: string;
  isActive: boolean;
  /** Worked minutes in the requested range; open shifts count up to now. */
  minutesWorked: number;
  name: string;
  /** True while a shift is open (no check-out yet). */
  onShiftNow: boolean;
  /** ISO instant the worker checked in on their open shift, or null. */
  openSince: string | null;
  /** Salary settling the range, from `expenses` — see `salaryPaidIn`. */
  paid: string;
  phone: string | null;
  role: string | null;
  salaryAmount: string;
  salaryType: string;
  shiftEnd: string | null;
  shiftStart: string | null;
  workingDays: number[];
}

export interface AttendanceSessionView {
  checkIn: string | null;
  checkOut: string | null;
  id: number;
  /** Minutes on this shift; an open shift counts up to now. */
  minutesWorked: number;
  /** True while the shift is still open. */
  open: boolean;
}

export interface WorkerDetail {
  sessionCount: number;
  sessions: AttendanceSessionView[];
  /** Total worked minutes across the sessions in range. */
  totalMinutes: number;
  worker: WorkerListItem;
}

const toIso = (value: Date | string | null): string | null => {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : String(value);
};

const toMoney = (value: string | number | null): string =>
  (Number(value ?? 0) || 0).toFixed(2);

/** MySQL TIME comes back "HH:MM:SS"; the UI wants "HH:MM". */
const toClock = (value: string | null): string | null =>
  value ? value.slice(0, 5) : null;

const parseWorkingDays = (value: string | null): number[] => {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7);
};

const serializeWorkingDays = (days: number[] | undefined): string | null => {
  if (!days || days.length === 0) {
    return null;
  }

  return [...new Set(days)].sort((a, b) => a - b).join(",");
};

const MS_PER_MINUTE = 60_000;

/** Local "YYYY-MM-DD" of a Date — the value the work_date column holds. */
const toDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const minutesBetween = (from: Date, to: Date): number =>
  Math.max(0, Math.round((to.getTime() - from.getTime()) / MS_PER_MINUTE));

interface DateRange {
  from: Date;
  to: Date;
}

/** The whole current month, the default the list opens on. */
export const currentMonthRange = (now = new Date()): DateRange => ({
  from: new Date(now.getFullYear(), now.getMonth(), 1),
  to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
});

const parseDate = (value: string | undefined): Date | null => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/** Reads `from`/`to` query strings into a range, defaulting to this month. */
export const rangeFromQuery = (
  from: string | undefined,
  to: string | undefined
): DateRange => {
  const fallback = currentMonthRange();
  const fromDate = parseDate(from);
  const toDate = parseDate(to);

  return {
    from: fromDate ?? fallback.from,
    // A date-only "to" should include the whole day.
    to: toDate
      ? new Date(
          toDate.getFullYear(),
          toDate.getMonth(),
          toDate.getDate(),
          23,
          59,
          59,
          999
        )
      : fallback.to,
  };
};

const workerScope = (gymId: string) =>
  and(
    eq(attendanceSessions.gymId, gymId),
    eq(attendanceSessions.personType, "worker")
  );

/**
 * Which of a gym's staff have a face on a terminal.
 *
 * One grouped read rather than a join or a query per worker, matching
 * `listMembers`: a gym with no terminals pays nothing for the column.
 */
const facesOf = async (gymId: string): Promise<Set<string>> => {
  const rows = await db
    .select({ ownerId: credentials.ownerId })
    .from(credentials)
    .where(
      and(
        eq(credentials.gymId, gymId),
        eq(credentials.ownerType, "worker"),
        eq(credentials.isActive, true)
      )
    );

  const enrolled = new Set<string>();

  for (const row of rows) {
    if (row.ownerId) {
      enrolled.add(row.ownerId);
    }
  }

  return enrolled;
};

/**
 * Which salary rows count as paid "in" a range.
 *
 * Two clauses, because two kinds of row exist. One carries the month it settles
 * (`action_id` = `salary:YYYY-MM`) and belongs to that month whenever the money
 * actually moved — July's wage handed over on 3 August is July's. The other
 * carries no period at all: a wage typed on the cashbox screen, or one recorded
 * before periods existed, and the only date it has is `paid_at`.
 *
 * A period payment counts whole or not at all. Half of July's wage is not a
 * thing that happened, so a range covering half of July still counts it in full
 * rather than splitting a payment the desk made once.
 *
 * Voided rows are corrections, not payments — counting them would show a worker
 * as paid for money that was taken back.
 */
const salaryPaidIn = (gymId: string, range: DateRange) => {
  const tags = monthsInRange(range.from, range.to).map(salaryPeriodTag);

  return and(
    eq(expenses.gymId, gymId),
    eq(expenses.category, SALARY_CATEGORY),
    isNull(expenses.voidedAt),
    or(
      tags.length > 0 ? inArray(expenses.actionId, tags) : undefined,
      and(
        isNull(expenses.actionId),
        gte(expenses.paidAt, range.from),
        lte(expenses.paidAt, range.to)
      )
    )
  );
};

const MINUTES_PER_HOUR = 60;

/** "YYYY-MM-DD" as a local date. `new Date(s)` would read it as UTC. */
const parseHireDate = (value: string | null): Date | null => {
  if (!value) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);

  if (!(year && month && day)) {
    return null;
  }

  return new Date(year, month - 1, day);
};

/**
 * What the worker has earned over the range.
 *
 * Hourly is arithmetic: hours on the clock times the rate.
 *
 * Monthly is a policy, and this is the one chosen — a month's salary is a flat
 * amount for that month, not something hours or absences scale. A whole month in
 * range is worth the whole salary; a partial one is prorated by calendar days,
 * which is also what makes a mid-month hire come out right. Missed shifts are a
 * deduction a manager decides on, not arithmetic this service should invent, so
 * they do not move this figure.
 */
const earnedOver = (
  row: typeof workers.$inferSelect,
  minutesWorked: number,
  range: DateRange
): string | null => {
  const amount = Number(row.salaryAmount ?? 0);

  if (!Number.isFinite(amount)) {
    return null;
  }

  if ((row.salaryType ?? "monthly") === "hourly") {
    return ((minutesWorked / MINUTES_PER_HOUR) * amount).toFixed(2);
  }

  const hiredAt = parseHireDate(row.hiredAt);
  let total = 0;

  for (const period of monthsInRange(range.from, range.to)) {
    total +=
      (amount * coveredDaysOfMonth(period, range, hiredAt)) /
      daysInMonth(period);
  }

  return total.toFixed(2);
};

const toWorkerItem = (
  row: typeof workers.$inferSelect,
  minutesWorked: number,
  open: { since: string | null } | null,
  hasFace: boolean,
  paid: number,
  range: DateRange
): WorkerListItem => ({
  balance: (() => {
    const earned = earnedOver(row, minutesWorked, range);

    return earned === null ? null : (Number(earned) - paid).toFixed(2);
  })(),
  earned: earnedOver(row, minutesWorked, range),
  paid: paid.toFixed(2),
  hasFace,
  id: row.workerId,
  name: row.fullname ?? "",
  phone: row.phone,
  role: row.role,
  salaryType: row.salaryType ?? "monthly",
  salaryAmount: toMoney(row.salaryAmount),
  hiredAt: toIso(row.hiredAt),
  shiftStart: toClock(row.expectedStart),
  shiftEnd: toClock(row.shiftEnd),
  workingDays: parseWorkingDays(row.workingDays),
  isActive: row.status !== "inactive",
  minutesWorked,
  onShiftNow: open !== null,
  openSince: open?.since ?? null,
});

/** How many minutes a session contributes; an open shift counts up to `now`. */
const sessionMinutes = (
  session: typeof attendanceSessions.$inferSelect,
  now: Date
): number => {
  if (session.checkOut) {
    return session.minutesWorked ?? 0;
  }

  return session.checkIn ? minutesBetween(session.checkIn, now) : 0;
};

export const listWorkers = async (
  gymId: string,
  range: DateRange
): Promise<WorkerListItem[]> => {
  const workerRows = await db
    .select()
    .from(workers)
    .where(eq(workers.gymId, gymId))
    .orderBy(asc(workers.fullname));

  if (workerRows.length === 0) {
    return [];
  }

  // One pass over the gym's sessions in range, bucketed by worker, rather than a
  // query per worker. None of the three depends on the others, so none waits.
  const [sessionRows, enrolled, paidRows] = await Promise.all([
    db
      .select()
      .from(attendanceSessions)
      .where(
        and(workerScope(gymId), gte(attendanceSessions.checkIn, range.from))
      ),
    facesOf(gymId),
    db
      .select({
        paid: sql<string>`SUM(${expenses.amount})`,
        workerId: expenses.workerId,
      })
      .from(expenses)
      .where(salaryPaidIn(gymId, range))
      .groupBy(expenses.workerId),
  ]);

  const paidByWorker = new Map<string, number>();

  for (const row of paidRows) {
    if (row.workerId) {
      paidByWorker.set(row.workerId, Number(row.paid ?? 0));
    }
  }

  const now = new Date();
  const minutesByWorker = new Map<string, number>();
  const openByWorker = new Map<string, string | null>();

  for (const session of sessionRows) {
    if (!session.personId) {
      continue;
    }

    // A still-open shift belongs to "now" regardless of the range's end.
    const inRange = session.checkIn && session.checkIn <= range.to;

    if (inRange) {
      minutesByWorker.set(
        session.personId,
        (minutesByWorker.get(session.personId) ?? 0) +
          sessionMinutes(session, now)
      );
    }

    if (!session.checkOut) {
      openByWorker.set(session.personId, toIso(session.checkIn));
    }
  }

  return workerRows.map((row) => {
    const open = openByWorker.has(row.workerId)
      ? { since: openByWorker.get(row.workerId) ?? null }
      : null;

    return toWorkerItem(
      row,
      minutesByWorker.get(row.workerId) ?? 0,
      open,
      enrolled.has(row.workerId),
      paidByWorker.get(row.workerId) ?? 0,
      range
    );
  });
};

export interface WorkerCounts {
  active: number;
  all: number;
  inactive: number;
  "on-shift": number;
}

export interface WorkerPage {
  /** Over the whole staff list, not the page — these label the filter. */
  counts: WorkerCounts;
  rows: WorkerListItem[];
  /** Rows matching the filter, before paging. */
  total: number;
}

/**
 * Search compares the phone as bare digits on both sides, because it is
 * displayed grouped — a search typed the way it reads would otherwise miss.
 */
const matchesWorkerQuery = (
  worker: WorkerListItem,
  needle: string
): boolean => {
  if (needle.length === 0) {
    return true;
  }

  const digits = needle.replace(/\D/g, "");

  return (
    worker.name.toLowerCase().includes(needle) ||
    (digits.length > 0 && (worker.phone ?? "").includes(digits))
  );
};

const matchesWorkerStatus = (
  worker: WorkerListItem,
  status: WorkerQueryInput["status"]
): boolean => {
  if (status === "active") {
    return worker.isActive;
  }

  if (status === "inactive") {
    return !worker.isActive;
  }

  if (status === "on-shift") {
    return worker.onShiftNow;
  }

  return true;
};

/**
 * The list screen's query: search, the status filter and the page, all answered
 * here so the browser receives one page instead of the whole roster.
 *
 * Like the members list, the filtering happens over assembled rows rather than
 * in SQL — hours worked and salary paid are summed across sessions and expenses
 * by `listWorkers`, so a WHERE clause would need a second copy of that
 * arithmetic to agree with the columns beside it.
 */
export const pageWorkers = async (
  gymId: string,
  range: DateRange,
  query: WorkerQueryInput
): Promise<WorkerPage> => {
  const all = await listWorkers(gymId, range);
  const needle = (query.query ?? "").trim().toLowerCase();

  const counts: WorkerCounts = {
    active: 0,
    all: all.length,
    inactive: 0,
    "on-shift": 0,
  };

  const matched: WorkerListItem[] = [];

  for (const worker of all) {
    if (worker.isActive) {
      counts.active += 1;
    } else {
      counts.inactive += 1;
    }

    if (worker.onShiftNow) {
      counts["on-shift"] += 1;
    }

    if (
      matchesWorkerStatus(worker, query.status) &&
      matchesWorkerQuery(worker, needle)
    ) {
      matched.push(worker);
    }
  }

  const start = (query.page - 1) * query.pageSize;

  return {
    counts,
    rows: matched.slice(start, start + query.pageSize),
    total: matched.length,
  };
};

const findWorker = async (
  gymId: string,
  workerId: string
): Promise<typeof workers.$inferSelect> => {
  const [row] = await db
    .select()
    .from(workers)
    .where(and(eq(workers.gymId, gymId), eq(workers.workerId, workerId)))
    .limit(1);

  if (!row) {
    throw new NotFoundError("Worker not found");
  }

  return row;
};

export const getWorkerDetail = async (
  gymId: string,
  workerId: string,
  range: DateRange
): Promise<WorkerDetail> => {
  // Nothing here depends on anything else here, so all four go at once.
  const [worker, sessionRows, enrolled, paidRows] = await Promise.all([
    findWorker(gymId, workerId),
    db
      .select()
      .from(attendanceSessions)
      .where(
        and(
          workerScope(gymId),
          eq(attendanceSessions.personId, workerId),
          gte(attendanceSessions.checkIn, range.from),
          lte(attendanceSessions.checkIn, range.to)
        )
      )
      .orderBy(desc(attendanceSessions.checkIn)),
    facesOf(gymId),
    db
      .select({ paid: sql<string>`SUM(${expenses.amount})` })
      .from(expenses)
      .where(and(salaryPaidIn(gymId, range), eq(expenses.workerId, workerId))),
  ]);

  const now = new Date();
  let totalMinutes = 0;

  const sessions: AttendanceSessionView[] = sessionRows.map((session) => {
    const minutes = sessionMinutes(session, now);

    totalMinutes += minutes;

    return {
      id: session.sessionId,
      checkIn: toIso(session.checkIn),
      checkOut: toIso(session.checkOut),
      minutesWorked: minutes,
      open: !session.checkOut,
    };
  });

  const openSession = sessionRows.find((session) => !session.checkOut);

  return {
    worker: toWorkerItem(
      worker,
      totalMinutes,
      openSession ? { since: toIso(openSession.checkIn) } : null,
      enrolled.has(workerId),
      Number(paidRows[0]?.paid ?? 0),
      range
    ),
    sessions,
    totalMinutes,
    sessionCount: sessions.length,
  };
};

/** One wage handed over, as the pay window lists it back. */
export interface SalaryPaymentView {
  amount: string;
  id: number;
  /** The till it came out of: "cash", "card" or "transfer". */
  method: string;
  note: string | null;
  /** When the money moved — not the month it settles, which is `period`. */
  paidAt: string | null;
  /** "YYYY-MM", or null for a wage typed on the cashbox screen. */
  period: string | null;
}

/**
 * Everything the pay window states about one worker and one month, so the
 * figures it shows and the figure it is about to write agree by construction.
 */
export interface WorkerPayroll {
  /**
   * Earned up to today, for a monthly salary in a month still running.
   *
   * `earned` is the whole month's salary from the first day, which is what the
   * worker will be owed and the wrong number to hand over on the 5th. This is
   * the same salary prorated to today. Null when there is no difference to
   * draw — an hourly wage already counts only hours worked, and a month that
   * has ended is simply earned in full.
   */
  accrued: string | null;
  earned: string | null;
  minutesWorked: number;
  paid: string;
  /** Wages settling this month, newest first. */
  payments: SalaryPaymentView[];
  /** The month being paid, "YYYY-MM". */
  period: string;
  /** `earned` minus `paid`: what is still to hand over. */
  remaining: string | null;
  worker: WorkerListItem;
}

export const getWorkerPayroll = async (
  gymId: string,
  workerId: string,
  period: string | undefined
): Promise<WorkerPayroll> => {
  const month = period ?? monthKey(new Date());
  const range = monthRange(month);

  const [worker, sessionRows, enrolled, paymentRows] = await Promise.all([
    findWorker(gymId, workerId),
    db
      .select()
      .from(attendanceSessions)
      .where(
        and(
          workerScope(gymId),
          eq(attendanceSessions.personId, workerId),
          gte(attendanceSessions.checkIn, range.from),
          lte(attendanceSessions.checkIn, range.to)
        )
      ),
    facesOf(gymId),
    db
      .select({
        actionId: expenses.actionId,
        amount: expenses.amount,
        id: expenses.id,
        method: expenses.method,
        note: expenses.note,
        paidAt: expenses.paidAt,
      })
      .from(expenses)
      .where(and(salaryPaidIn(gymId, range), eq(expenses.workerId, workerId)))
      .orderBy(desc(expenses.paidAt), desc(expenses.id)),
  ]);

  const now = new Date();
  let minutesWorked = 0;
  let paid = 0;

  for (const session of sessionRows) {
    minutesWorked += sessionMinutes(session, now);
  }

  const payments: SalaryPaymentView[] = paymentRows.map((row) => {
    paid += Number(row.amount ?? 0);

    return {
      amount: toMoney(row.amount),
      id: row.id,
      method: row.method,
      note: row.note,
      paidAt: toIso(row.paidAt),
      period: salaryPeriodOf(row.actionId),
    };
  });

  const openSession = sessionRows.find((session) => !session.checkOut);

  const item = toWorkerItem(
    worker,
    minutesWorked,
    openSession ? { since: toIso(openSession.checkIn) } : null,
    enrolled.has(workerId),
    paid,
    range
  );

  // Only a monthly salary in a month that has not finished yet has two
  // different answers to "how much has he earned".
  const isRunningMonth = month === monthKey(now);
  const accrued =
    isRunningMonth && (worker.salaryType ?? "monthly") !== "hourly"
      ? earnedOver(worker, minutesWorked, { from: range.from, to: now })
      : null;

  return {
    accrued,
    earned: item.earned,
    minutesWorked,
    paid: paid.toFixed(2),
    payments,
    period: month,
    remaining: item.balance,
    worker: item,
  };
};

/**
 * Hand a wage over: one `expenses` row, exactly the shape the cashbox screen
 * writes, plus the month it settles in `action_id` (see `lib/payroll.ts`).
 *
 * `paid_at` is now rather than anything the desk picks. The two dates a payment
 * has are "when the money moved" and "which month it is for", and the second is
 * the one being asked for explicitly — letting the first be edited too would
 * offer two ways to answer the same question and make the cashbox disagree with
 * the till.
 */
export const payWorker = async (
  gymId: string,
  workerId: string,
  input: PayWorkerInput,
  createdBy: string | null
): Promise<void> => {
  if (!createdBy) {
    throw new UnauthorizedError("Missing x-worker-id");
  }

  const worker = await findWorker(gymId, workerId);
  const branchId = await resolveWorkerBranch(gymId, worker);

  await db.insert(expenses).values({
    actionId: salaryPeriodTag(input.period),
    amount: input.amount,
    branchId,
    category: SALARY_CATEGORY,
    createdBy,
    gymId,
    method: input.method,
    note: input.note ?? null,
    paidAt: new Date(),
    supplierId: null,
    voidedAt: null,
    voidedBy: null,
    workerId,
  });
};

/** A worker's home branch, or the gym's first, so attendance has a branch. */
const resolveWorkerBranch = async (
  gymId: string,
  worker: typeof workers.$inferSelect
): Promise<string | null> => {
  if (worker.branchId) {
    return worker.branchId;
  }

  const [branch] = await db
    .select({ id: branches.branchId })
    .from(branches)
    .where(eq(branches.gymId, gymId))
    .limit(1);

  return branch?.id ?? null;
};

const firstBranch = async (gymId: string): Promise<string | null> => {
  const [branch] = await db
    .select({ id: branches.branchId })
    .from(branches)
    .where(eq(branches.gymId, gymId))
    .limit(1);

  return branch?.id ?? null;
};

export const createWorker = async (
  gymId: string,
  input: CreateWorkerInput
): Promise<WorkerListItem> => {
  const workerId = nanoid(ID_LENGTH);
  const branchId = await firstBranch(gymId);

  await db.insert(workers).values({
    workerId,
    gymId,
    branchId,
    fullname: input.fullname,
    phone: input.phone,
    role: input.role,
    // Added staff have no login: they are payroll/attendance records, not users.
    login: null,
    passwordHash: null,
    salaryType: input.salaryType,
    salaryAmount: input.salaryAmount,
    expectedStart: input.shiftStart ?? null,
    shiftEnd: input.shiftEnd ?? null,
    workingDays: serializeWorkingDays(input.workingDays),
    lateGraceMin: 0,
    status: "active",
    hiredAt: input.hiredAt ?? null,
    createdAt: new Date(),
  });

  const worker = await findWorker(gymId, workerId);

  // Seconds old: there has been no chance to enrol a face yet, and the sheet
  // opens the face dialog against this id straight after.
  return toWorkerItem(worker, 0, null, false, 0, currentMonthRange());
};

export const updateWorker = async (
  gymId: string,
  workerId: string,
  input: UpdateWorkerInput
): Promise<void> => {
  await findWorker(gymId, workerId);

  await db
    .update(workers)
    .set({
      ...(input.fullname === undefined ? {} : { fullname: input.fullname }),
      ...(input.phone === undefined ? {} : { phone: input.phone }),
      ...(input.role === undefined ? {} : { role: input.role }),
      ...(input.salaryType === undefined
        ? {}
        : { salaryType: input.salaryType }),
      ...(input.salaryAmount === undefined
        ? {}
        : { salaryAmount: input.salaryAmount }),
      ...(input.hiredAt === undefined
        ? {}
        : { hiredAt: input.hiredAt ?? null }),
      ...(input.shiftStart === undefined
        ? {}
        : { expectedStart: input.shiftStart ?? null }),
      ...(input.shiftEnd === undefined
        ? {}
        : { shiftEnd: input.shiftEnd ?? null }),
      ...(input.workingDays === undefined
        ? {}
        : { workingDays: serializeWorkingDays(input.workingDays) }),
    })
    .where(and(eq(workers.gymId, gymId), eq(workers.workerId, workerId)));
};

export const setWorkerActive = async (
  gymId: string,
  workerId: string,
  isActive: boolean
): Promise<void> => {
  await findWorker(gymId, workerId);

  await db
    .update(workers)
    .set({ status: isActive ? "active" : "inactive" })
    .where(and(eq(workers.gymId, gymId), eq(workers.workerId, workerId)));
};

/** The open shift for a worker, or null if they are not checked in. */
const openSessionOf = async (gymId: string, workerId: string) => {
  const [session] = await db
    .select()
    .from(attendanceSessions)
    .where(
      and(
        workerScope(gymId),
        eq(attendanceSessions.personId, workerId),
        isNull(attendanceSessions.checkOut)
      )
    )
    .orderBy(desc(attendanceSessions.checkIn))
    .limit(1);

  return session ?? null;
};

const resolveInstant = (at: string | undefined): Date => {
  if (!at) {
    return new Date();
  }

  const parsed = new Date(at);

  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestError("Invalid time");
  }

  return parsed;
};

export const checkIn = async (
  gymId: string,
  workerId: string,
  input: AttendanceMarkInput
): Promise<void> => {
  const worker = await findWorker(gymId, workerId);

  if (await openSessionOf(gymId, workerId)) {
    throw new ConflictError("Worker is already checked in");
  }

  const at = resolveInstant(input.at);
  const branchId = await resolveWorkerBranch(gymId, worker);

  await db.transaction(async (tx) => {
    await tx.insert(attendanceSessions).values({
      gymId,
      branchId,
      personType: "worker",
      personId: workerId,
      workDate: toDateString(at),
      checkIn: at,
      checkOut: null,
      minutesWorked: null,
      status: "open",
      needsReview: false,
      isCorrected: false,
      // Attendance has no operator column, so a manual mark records no actor.
      correctedBy: null,
      createdAt: new Date(),
    });

    await tx.insert(attendanceEvents).values({
      gymId,
      branchId,
      personType: "worker",
      personId: workerId,
      credentialId: null,
      deviceId: null,
      eventTime: at,
      direction: "in",
      source: "manual",
      createdAt: new Date(),
    });
  });
};

export const checkOut = async (
  gymId: string,
  workerId: string,
  input: AttendanceMarkInput
): Promise<void> => {
  const worker = await findWorker(gymId, workerId);
  const session = await openSessionOf(gymId, workerId);

  if (!session) {
    throw new ConflictError("Worker is not checked in");
  }

  const at = resolveInstant(input.at);

  if (session.checkIn && at < session.checkIn) {
    throw new BadRequestError("Check-out cannot be before check-in");
  }

  const branchId = await resolveWorkerBranch(gymId, worker);
  const minutes = session.checkIn ? minutesBetween(session.checkIn, at) : 0;

  await db.transaction(async (tx) => {
    await tx
      .update(attendanceSessions)
      .set({
        checkOut: at,
        minutesWorked: minutes,
        status: "closed",
      })
      .where(eq(attendanceSessions.sessionId, session.sessionId));

    await tx.insert(attendanceEvents).values({
      gymId,
      branchId,
      personType: "worker",
      personId: workerId,
      credentialId: null,
      deviceId: null,
      eventTime: at,
      direction: "out",
      source: "manual",
      createdAt: new Date(),
    });
  });
};

/** One wage handed over, as the salary-history screen lists it. */
export interface SalaryHistoryRow {
  amount: string;
  id: number;
  /** The till it came out of: "cash", "card" or "transfer". */
  method: string;
  note: string | null;
  /** When the money moved. */
  paidAt: string | null;
  /** The "YYYY-MM" it settles, or null for a wage typed on the cashbox. */
  period: string | null;
  workerId: string | null;
  /** Null only if the worker row was deleted out from under the expense. */
  workerName: string | null;
}

export interface SalaryHistoryPage {
  /**
   * Every worker who has ever been paid — the filter's options, by name.
   *
   * Deliberately not narrowed by the range or by the worker filter. An options
   * list that shrank to the one name you just picked would strand you there
   * with no way back to "everyone", and one that emptied along with the date
   * range would read as "this gym has no staff".
   */
  options: { id: string; name: string }[];
  rows: SalaryHistoryRow[];
  /** Rows matching the filter, not just the ones on this page. */
  total: number;
  /** What those rows add up to — the whole filter, not the page. */
  totalAmount: string;
}

/** Wages only, never voided, inside the range, optionally one worker's. */
const salaryHistoryWhere = (
  gymId: string,
  range: DateRange,
  workerId: string | undefined
) =>
  and(
    eq(expenses.gymId, gymId),
    eq(expenses.category, SALARY_CATEGORY),
    isNull(expenses.voidedAt),
    gte(expenses.paidAt, range.from),
    lte(expenses.paidAt, range.to),
    workerId ? eq(expenses.workerId, workerId) : undefined
  );

/**
 * Every wage the gym has handed over, across all staff.
 *
 * The totals are computed in SQL over the whole filter rather than summed from
 * `rows`, because `rows` is one page — adding up what is on screen would make
 * the total change as you page, which is the sort of number a desk stops
 * trusting.
 */
export const listSalaryPayments = async (
  gymId: string,
  range: DateRange,
  query: SalaryHistoryQueryInput
): Promise<SalaryHistoryPage> => {
  const where = salaryHistoryWhere(gymId, range, query.workerId);

  const [rows, totals, options] = await Promise.all([
    db
      .select({
        actionId: expenses.actionId,
        amount: expenses.amount,
        id: expenses.id,
        method: expenses.method,
        note: expenses.note,
        paidAt: expenses.paidAt,
        workerId: expenses.workerId,
        workerName: workers.fullname,
      })
      .from(expenses)
      .leftJoin(workers, eq(workers.workerId, expenses.workerId))
      .where(where)
      .orderBy(desc(expenses.paidAt), desc(expenses.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db
      .select({
        count: sql<number>`COUNT(*)`,
        sum: sql<string>`SUM(${expenses.amount})`,
      })
      .from(expenses)
      .where(where),
    db
      .selectDistinct({ id: expenses.workerId, name: workers.fullname })
      .from(expenses)
      .innerJoin(workers, eq(workers.workerId, expenses.workerId))
      .where(
        and(
          eq(expenses.gymId, gymId),
          eq(expenses.category, SALARY_CATEGORY),
          isNull(expenses.voidedAt)
        )
      )
      .orderBy(asc(workers.fullname)),
  ]);

  return {
    options: options.flatMap((row) =>
      row.id ? [{ id: row.id, name: row.name ?? row.id }] : []
    ),
    rows: rows.map((row) => ({
      amount: toMoney(row.amount),
      id: row.id,
      method: row.method,
      note: row.note,
      paidAt: toIso(row.paidAt),
      period: salaryPeriodOf(row.actionId),
      workerId: row.workerId,
      workerName: row.workerName,
    })),
    total: Number(totals[0]?.count ?? 0),
    totalAmount: toMoney(totals[0]?.sum ?? 0),
  };
};

/**
 * The day of the month the gym settles monthly salaries on, or null when the
 * desk has never chosen one.
 *
 * It lives on `gyms` rather than on each worker because it is a policy of the
 * business, not of the person — one gym pays everybody on the same day, and a
 * per-worker copy would be thirty rows to keep in step for a single decision.
 */
export const getPayday = async (gymId: string): Promise<number | null> => {
  const [row] = await db
    .select({ payday: gyms.payday })
    .from(gyms)
    .where(eq(gyms.gymId, gymId))
    .limit(1);

  if (!row) {
    throw new NotFoundError("Gym not found");
  }

  return row.payday ?? null;
};

export const setPayday = async (
  gymId: string,
  payday: number
): Promise<void> => {
  await db.update(gyms).set({ payday }).where(eq(gyms.gymId, gymId));
};
