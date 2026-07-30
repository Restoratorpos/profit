import { z } from "zod";

/** Free-form varchar in SQL, so the accepted set is decided here. */
export const MEMBER_GENDERS = ["male", "female"] as const;

/** Which slice of the roster the list is showing. */
export const MEMBER_FILTERS = [
  "all",
  "active",
  "expiring",
  "inactive",
] as const;

/** Who owes money, and for what. Absent means "not filtered by debt". */
export const DEBT_FILTERS = ["any", "membership", "shop"] as const;

export const memberQuerySchema = z.object({
  debt: z.enum(DEBT_FILTERS).optional(),
  filter: z.enum(MEMBER_FILTERS).default("all"),
  page: z.coerce.number().int().min(1).default(1),
  // The screen offers 25 / 50 / 100. The cap is enforced here rather than
  // trusted from the client — the buttons are not what protects the query.
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  query: z.string().trim().max(120).optional(),
});

export type MemberQueryInput = z.infer<typeof memberQuerySchema>;

export const MEMBER_STATUSES = ["active", "inactive"] as const;

/**
 * How a membership was settled at the desk. `debt` records the sale with no
 * money taken yet; `free` records a comped membership, which is not the same
 * thing — one is owed and chased, the other never will be.
 */
export const PAYMENT_TYPES = ["cash", "card", "debt", "free"] as const;

export type PaymentType = (typeof PAYMENT_TYPES)[number];

const money = z.coerce
  .number()
  .min(0, "Cannot be negative")
  .max(999_999_999_999.99, "Too large for the column")
  .transform((value) => value.toFixed(2));

/**
 * One leg of how a membership was settled: a method, and how much of the price
 * it covers. `amount` omitted means "whatever is left", which is what the last
 * leg almost always wants; `debt` and `free` ignore it and end the chain.
 */
const paymentLegSchema = z.object({
  amount: money.optional(),
  method: z.enum(PAYMENT_TYPES),
});

export type MembershipPaymentLeg = z.infer<typeof paymentLegSchema>;

/** A sale may be split three ways at most — the same cap the shop uses. */
export const MAX_PAYMENT_LEGS = 3;

/** "YYYY-MM-DD". */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const isoDate = z.string().regex(DATE_PATTERN, "Expected YYYY-MM-DD");

const memberFields = {
  fullname: z.string().trim().min(1).max(200),
  /** Bare digits, same convention as every other phone in this system. */
  phone: z.string().trim().min(1).max(20),
  gender: z.enum(MEMBER_GENDERS).nullish(),
  birthdate: isoDate.nullish(),
  note: z.string().trim().max(2000).nullish(),
  branchId: z.string().trim().max(20).nullish(),
};

/**
 * Creating a member optionally sells them a membership in the same request —
 * that is how the front desk actually works, and splitting it into two calls
 * would let a person exist with the plan they paid for silently missing.
 */
/**
 * Selling one membership.
 *
 * Shared by two callers: creating a member with a plan in the same request, and
 * adding a further membership to someone who already exists. They are the same
 * sale — a member can hold a gym plan, a spa pass and a sauna package at once,
 * and the second and third are sold exactly the way the first was.
 */
export const membershipSaleSchema = z.object({
  planId: z.string().trim().min(1).max(20),
  startsAt: isoDate,
  /**
   * How the membership is settled, in the order the desk entered it: some
   * cash, then the rest on a card, then whatever is still short left owed.
   *
   * An ordinary sale is a single leg. Legs are applied until the plan's
   * price is covered or the list runs out, and anything still short at the
   * end is the member's debt — so `[{ method: "cash" }]` is "all of it in
   * cash" and `[{ method: "debt" }]` is "none of it, all owed".
   *
   * No leg's amount is trusted beyond what is actually outstanding: the
   * price is read from the plan, never from the client.
   */
  payments: z
    .array(paymentLegSchema)
    .min(1, "A membership sale needs a payment method")
    .max(MAX_PAYMENT_LEGS, "A sale may be split three ways at most"),
});

export const createMemberSchema = z.object({
  ...memberFields,
  membership: membershipSaleSchema.nullish(),
});

export type MembershipSaleInput = z.infer<typeof membershipSaleSchema>;

export const updateMemberSchema = z.object(memberFields);

export const setMemberActiveSchema = z.object({
  isActive: z.boolean(),
});

export type CreateMemberInput = z.infer<typeof createMemberSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
export type SetMemberActiveInput = z.infer<typeof setMemberActiveSchema>;
