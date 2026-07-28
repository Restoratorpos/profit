import { z } from "zod";

/**
 * How the plan is charged. Free-form varchar(16) in SQL, so the set is decided
 * here: a subscription that renews each period, or a single purchase.
 */
export const BILLING_TYPES = ["recurring", "one_time"] as const;

export type BillingType = (typeof BILLING_TYPES)[number];

/** ISO weekday numbers, 1 = Monday. Stored comma-separated in `weekdays`. */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

const money = z.coerce
  .number()
  .min(0, "Cannot be negative")
  .max(999_999_999_999.99, "Too large for the column")
  .transform((value) => value.toFixed(2));

/** "HH:MM", 24-hour. */
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const time = z.string().regex(TIME_PATTERN, "Expected HH:MM");

export const createPlanSchema = z.object({
  name: z.string().trim().min(1).max(255),
  billingType: z.enum(BILLING_TYPES),
  price: money,
  /** Days the plan runs for. */
  duration: z.coerce.number().int().min(1).max(100_000),

  /**
   * Entries allowed, where **0 means unlimited** — which is why the floor is 0
   * and not 1. A plan can grant access without capping how often it is used.
   */
  entryLimit: z.coerce.number().int().min(0).max(100_000).default(0),
  /** Daily entry window. Both null when the plan grants no gym access. */
  accessFrom: time.nullish(),
  accessTo: time.nullish(),
  /** Empty means the plan grants no entry at all. */
  weekdays: z.array(z.number().int().min(1).max(7)).max(7).default([]),

  trainerId: z.string().trim().max(20).nullish(),
  hallId: z.string().trim().max(20).nullish(),
  /** Capacity for a class-style plan. */
  slots: z.coerce.number().int().min(0).max(100_000).nullish(),

  description: z.string().trim().max(2000).nullish(),
  /** Null branch means the plan is sold at every branch. */
  branchId: z.string().trim().max(20).nullish(),
  isActive: z.boolean().default(true),
});

// A plan is always saved whole, so update takes the same shape.
export const updatePlanSchema = createPlanSchema;

/**
 * Activation is its own endpoint: the plans table toggles it with one tap and
 * has no other field to send, so replaying the whole plan would risk writing
 * back a stale copy of every column just to flip a boolean.
 */
export const setPlanActiveSchema = z.object({
  isActive: z.boolean(),
});

export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;
export type SetPlanActiveInput = z.infer<typeof setPlanActiveSchema>;

export const createHallSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

export type CreateHallInput = z.infer<typeof createHallSchema>;
