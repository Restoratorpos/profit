import { z } from "zod";
import { PERIOD_PATTERN } from "../lib/payroll.js";

/**
 * A staff member's position. Free-form varchar(32) in SQL, but the API fixes the
 * set the desk can pick from. Distinct from `WORKER_ROLES` (the auth tiers): a
 * worker added here has no login and never authenticates — it is a payroll and
 * attendance record, so a "cleaner" or "guard" is valid where an auth role is
 * not.
 */
export const WORKER_POSITIONS = [
  "manager",
  "trainer",
  "receptionist",
  "cleaner",
  "guard",
  "other",
] as const;

/** How a worker is paid. `hourly` accrues on worked minutes; `monthly` on payday. */
export const WORKER_SALARY_TYPES = ["monthly", "hourly"] as const;

const money = z.coerce
  .number()
  .min(0, "Cannot be negative")
  .max(999_999_999_999.99, "Too large for the column")
  .transform((value) => value.toFixed(2));

/** "HH:MM" 24-hour, the value the shift/time inputs hold. */
const clockTime = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected a time like 09:00");

/** ISO weekday numbers, 1 (Mon) … 7 (Sun). */
const workingDays = z.array(z.number().int().min(1).max(7)).max(7);

export const createWorkerSchema = z.object({
  fullname: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(1).max(20),
  role: z.enum(WORKER_POSITIONS),
  salaryType: z.enum(WORKER_SALARY_TYPES),
  salaryAmount: money,
  hiredAt: z.string().trim().date().nullish(),
  shiftStart: clockTime.nullish(),
  shiftEnd: clockTime.nullish(),
  workingDays: workingDays.optional(),
});

/**
 * Every field optional, at least one present. Not `.partial()` — that would keep
 * defaults and let an empty body silently rewrite fields.
 */
export const updateWorkerSchema = z
  .object({
    fullname: z.string().trim().min(1).max(200).optional(),
    phone: z.string().trim().min(1).max(20).optional(),
    role: z.enum(WORKER_POSITIONS).optional(),
    salaryType: z.enum(WORKER_SALARY_TYPES).optional(),
    salaryAmount: money.optional(),
    hiredAt: z.string().trim().date().nullish(),
    shiftStart: clockTime.nullish(),
    shiftEnd: clockTime.nullish(),
    workingDays: workingDays.optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "Provide at least one field to update"
  );

export const setWorkerActiveSchema = z.object({
  isActive: z.boolean(),
});

/**
 * A manual check-in or check-out. `at` is an ISO instant the desk picks on the
 * time wheel; omitted means now, resolved in the service so the two agree.
 */
export const attendanceMarkSchema = z.object({
  at: z.string().trim().datetime().optional(),
});

/**
 * The three tills wages can come out of — the literal `expenses.method` values,
 * the same set /inventory pays a supplier from. `debt` and `free` are absent on
 * purpose: both describe a transaction where no money moved, and a wage that was
 * not handed over is not a payment.
 */
export const SALARY_METHODS = ["cash", "card", "transfer"] as const;

/**
 * A wage handed to a worker.
 *
 * `period` is the month the payment settles, not the day it was made — see
 * `lib/payroll.ts`. It is required rather than defaulted to the current month,
 * because the common time to pay is the first days of the *next* one, and a
 * silent default would file half the year's wages against the wrong month.
 *
 * The amount is deliberately not capped at what is outstanding. An advance is a
 * real thing a gym pays, and refusing one here would send the desk to the
 * cashbox screen to type the same row with less context.
 */
export const payWorkerSchema = z.object({
  amount: z.coerce
    .number()
    .positive("Enter an amount greater than zero")
    .max(999_999_999_999.99, "Too large for the column")
    .transform((value) => value.toFixed(2)),
  method: z.enum(SALARY_METHODS),
  note: z.string().trim().max(255).optional(),
  period: z
    .string()
    .trim()
    .regex(PERIOD_PATTERN, "Expected a month like 2026-07"),
});

/** The month a payroll figure is asked for, defaulting to the current one. */
export const payrollQuerySchema = z.object({
  period: z
    .string()
    .trim()
    .regex(PERIOD_PATTERN, "Expected a month like 2026-07")
    .optional(),
});

export type CreateWorkerInput = z.infer<typeof createWorkerSchema>;
export type UpdateWorkerInput = z.infer<typeof updateWorkerSchema>;
export type SetWorkerActiveInput = z.infer<typeof setWorkerActiveSchema>;
export type AttendanceMarkInput = z.infer<typeof attendanceMarkSchema>;
export type PayWorkerInput = z.infer<typeof payWorkerSchema>;

/** Which slice of the staff list is showing. */
export const WORKER_FILTERS = [
  "active",
  "on-shift",
  "inactive",
  "all",
] as const;

export const workerQuerySchema = z.object({
  from: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  query: z.string().trim().max(120).optional(),
  status: z.enum(WORKER_FILTERS).default("active"),
  to: z.string().trim().optional(),
});

export type WorkerQueryInput = z.infer<typeof workerQuerySchema>;
