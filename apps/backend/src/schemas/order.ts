import { z } from "zod";
import { discountSchema } from "./discount.js";

/**
 * How a debt is being settled at the desk. Only the money-in methods are valid
 * for paying down an existing order balance — `cash` and `card` record an
 * income row. `debt`/`free` describe how a sale was made, not how a debt is
 * cleared, so they are not offered here.
 */
export const ORDER_PAYMENT_TYPES = ["cash", "card"] as const;

export type OrderPaymentType = (typeof ORDER_PAYMENT_TYPES)[number];

const money = z.coerce
  .number()
  .positive("Must be greater than zero")
  .max(999_999_999_999.99, "Too large for the column")
  .transform((value) => value.toFixed(2));

/** Like `money`, but zero is allowed — a sale can be rung up fully on credit. */
const paidMoney = z.coerce
  .number()
  .min(0, "Cannot be negative")
  .max(999_999_999_999.99, "Too large for the column")
  .transform((value) => value.toFixed(2));

/**
 * Paying settles the member's whole outstanding order balance, not one order:
 * the desk sees a single figure and a single amount box. The amount is applied
 * to their oldest unsettled orders first — see order.service.
 */
export const payOrdersSchema = z.object({
  amount: money,
  /**
   * Forgiven off the outstanding balance before the payment is applied — a
   * discount given at the counter rather than at the till, which is the ordinary
   * case for "settle it for 400 and we'll call it square".
   *
   * A percentage resolves against what is actually still owed, not the original
   * sale: the desk is discounting the balance in front of them.
   */
  discount: discountSchema.nullish(),
  paymentType: z.enum(ORDER_PAYMENT_TYPES),
});

export type PayOrdersInput = z.infer<typeof payOrdersSchema>;

/**
 * How a brand-new sale is settled at the till.
 *
 * `cash`/`card` take money — in full, or short, leaving the rest as the buyer's
 * balance. `debt` takes nothing and leaves the whole total owing, so it is only
 * valid for a member (a walk-in has no balance to chase). `free` also takes
 * nothing but owes nothing either: a comp, on the house, and it settles on the
 * spot — which is why even a walk-in may have one.
 */
export const ORDER_CHECKOUT_TYPES = ["cash", "card", "debt", "free"] as const;

export type OrderCheckoutType = (typeof ORDER_CHECKOUT_TYPES)[number];

/**
 * One line on the ticket: a product or a combo, never both. The client says
 * which and how many; the price and the makeup are snapshotted server-side from
 * the catalog, never trusted from the client.
 */
const orderItemSchema = z
  .object({
    productId: z.string().trim().min(1).max(20).nullish(),
    comboId: z.string().trim().min(1).max(16).nullish(),
    quantity: z.coerce.number().int().positive().max(100_000),
  })
  .refine(
    (item) => Boolean(item.productId) !== Boolean(item.comboId),
    "Each item must reference exactly one of a product or a combo"
  );

/**
 * Why units came off a line. Stored as the key in `order_item_adjustments.reason`
 * so the desk's wording can be retranslated without rewriting history.
 */
export const REMOVAL_REASONS = [
  "changed_mind",
  "customer_fault",
  "wrong_item",
  "damaged",
  "other",
] as const;

export type RemovalReason = (typeof REMOVAL_REASONS)[number];

/**
 * Where those units went — the whole point of asking. `returned` puts them back
 * on the shelf; `wasted` writes the loss off, so stock on hand does **not** rise
 * and the waste shows up as waste rather than as a sale that never happened.
 * Both fit `disposition varchar(10)`.
 */
export const REMOVAL_DISPOSITIONS = ["wasted", "returned"] as const;

export type RemovalDisposition = (typeof REMOVAL_DISPOSITIONS)[number];

/**
 * Correcting a member's open orders after the fact. `lines` gives the new
 * quantity for an existing line — `0` voids it — and `added` appends products to
 * their most recent open order. Prices for added lines are read from the catalog
 * exactly as they are at checkout, never taken from the client.
 *
 * A line that loses units must say why and where they went; the service enforces
 * that, since only it knows the stored quantity and therefore the direction.
 */
export const editOrderItemsSchema = z
  .object({
    added: z.array(orderItemSchema).default([]),
    lines: z
      .array(
        z.object({
          id: z.string().trim().min(1).max(20),
          quantity: z.coerce.number().int().min(0).max(100_000),
          disposition: z.enum(REMOVAL_DISPOSITIONS).optional(),
          reason: z.enum(REMOVAL_REASONS).optional(),
        })
      )
      .default([]),
  })
  .refine(
    (input) => input.lines.length + input.added.length > 0,
    "Nothing to change"
  )
  .refine(
    (input) =>
      new Set(input.lines.map((line) => line.id)).size === input.lines.length,
    "The same line may only appear once"
  );

export type EditOrderItemsInput = z.infer<typeof editOrderItemsSchema>;

/**
 * Ringing up a sale. `userId` is a member id, or null for a walk-in (Mijozsiz).
 */
/**
 * One leg of how a sale was settled: a method, and how much of the total it
 * covers.
 *
 * `amount` is optional and means "whatever is left" — which is what the last
 * leg almost always wants, and it is also the only figure the client can get
 * wrong. `debt` and `free` ignore it entirely: neither takes money, so both end
 * the chain wherever they appear.
 */
const paymentLegSchema = z.object({
  amount: paidMoney.optional(),
  method: z.enum(ORDER_CHECKOUT_TYPES),
});

export type PaymentLeg = z.infer<typeof paymentLegSchema>;

/** A sale may be split three ways at most — see `settleCheckout`. */
export const MAX_PAYMENT_LEGS = 3;

export const createOrderSchema = z.object({
  userId: z.string().trim().max(20).nullish(),
  items: z.array(orderItemSchema).min(1, "A sale needs at least one item"),
  /**
   * Taken off the line totals before the payment legs are walked, so a discounted
   * sale is settled — and owed — against the discounted figure. Omitted means no
   * discount; the server resolves a percentage against its own subtotal.
   */
  discount: discountSchema.nullish(),
  /**
   * How the sale is settled, in the order the desk entered it: some cash, then
   * the rest on a card, then whatever is still short left as a debt.
   *
   * An ordinary sale is a single leg. Legs are applied until the total is
   * covered or the list runs out, and anything still short at the end is the
   * buyer's debt — so `[{ method: "cash" }]` is "all of it in cash" and
   * `[{ method: "debt" }]` is "none of it, all owed".
   *
   * No leg's amount is trusted beyond what is actually outstanding: the total
   * comes from the catalog, so a client and a server can never disagree about
   * what somebody owes.
   */
  payments: z
    .array(paymentLegSchema)
    .min(1, "A sale needs a payment method")
    .max(MAX_PAYMENT_LEGS, "A sale may be split three ways at most"),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
