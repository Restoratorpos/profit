/**
 * What a discount takes off a sale.
 *
 * The desk enters either a rate ("10% off") or a figure ("20,000 off"), and both
 * become money here — a rate is resolved against the gross the *server* computed
 * from its own catalog prices, never against a total the client sent. That is the
 * same rule the payment legs follow, for the same reason: a client and a server
 * must never be able to disagree about what somebody owes.
 *
 * Only money is stored. A rate is a way of arriving at a figure, not the fact
 * worth keeping: the gross a percentage was taken against changes the moment the
 * order is edited or a plan is repriced, and a stored rate would then silently
 * mean a different amount than the one the operator agreed with the member.
 */

/** Two decimals, the precision both money columns carry. */
const toCents = (value: number): number => Math.round(value * 100) / 100;

export const DISCOUNT_KINDS = ["percent", "amount"] as const;

export type DiscountKind = (typeof DISCOUNT_KINDS)[number];

export interface DiscountInput {
  kind: DiscountKind;
  /** Percentage points when `kind` is `percent`, otherwise money. */
  value: number;
}

/**
 * The money a discount removes from `gross`, floored at zero and capped at the
 * gross itself.
 *
 * Capped rather than rejected: "take 50,000 off" against a 30,000 sale is a
 * whole discount, not an error, and a sale that went negative would book a credit
 * nobody can spend. Floored for the same reason in reverse — a negative discount
 * is a surcharge, and if that is ever wanted it should be asked for by name.
 */
export const discountOf = (
  gross: number,
  discount: DiscountInput | null | undefined
): number => {
  if (!(discount && Number.isFinite(gross)) || gross <= 0) {
    return 0;
  }

  const raw =
    discount.kind === "percent"
      ? (gross * discount.value) / 100
      : discount.value;

  if (!Number.isFinite(raw) || raw <= 0) {
    return 0;
  }

  return Math.min(toCents(raw), toCents(gross));
};

/**
 * A discount already recorded in money, re-applied to a gross that has since
 * moved — an order whose lines were edited after the fact.
 *
 * The figure survives the edit rather than the rate: the operator took 20,000 off
 * this sale, so 20,000 stays off it. It is re-capped, because an order can shrink
 * below what was discounted, and a discount larger than the sale would leave a
 * negative total behind.
 */
export const cappedDiscount = (gross: number, discount: number): number => {
  if (!(Number.isFinite(gross) && Number.isFinite(discount)) || discount <= 0) {
    return 0;
  }

  return Math.min(toCents(discount), Math.max(toCents(gross), 0));
};
