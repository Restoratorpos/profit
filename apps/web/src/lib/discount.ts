/**
 * What a discount takes off a sale, on the screen.
 *
 * This mirrors `apps/backend/src/lib/discount.ts`, which is the one that counts —
 * the server resolves the discount again from its own catalog or plan price, so a
 * client that computed a different figure changes nothing about what is charged.
 * What lives here exists so the desk can watch the total drop as it types, and so
 * the payment legs below it settle against the figure on screen.
 *
 * Keep the two identical. They are the same three rules: a rate resolves against
 * the gross, a figure is taken as read, and neither may exceed the sale.
 */

/** Two decimals, the precision both money columns carry. */
const toCents = (value: number): number => Math.round(value * 100) / 100;

export const DISCOUNT_KINDS = ["percent", "amount"] as const;

export type DiscountKind = (typeof DISCOUNT_KINDS)[number];

/**
 * A discount as the desk is entering it, which is why `value` is a string: it is
 * what is in the box, including the half-typed states — "", "1", "10." — that a
 * number would have to invent a value for.
 */
export interface DiscountDraft {
  kind: DiscountKind;
  value: string;
}

export const emptyDiscount = (): DiscountDraft => ({
  kind: "amount",
  value: "",
});

/**
 * The money a discount removes from `gross`, floored at zero and capped at the
 * gross itself. An empty or half-typed box takes nothing off.
 */
export const discountOf = (gross: number, discount: DiscountDraft): number => {
  const entered = Number(discount.value);

  if (
    discount.value.trim() === "" ||
    !(Number.isFinite(entered) && Number.isFinite(gross)) ||
    gross <= 0 ||
    entered <= 0
  ) {
    return 0;
  }

  const raw = discount.kind === "percent" ? (gross * entered) / 100 : entered;

  return Math.min(toCents(raw), toCents(gross));
};

/** Whether the desk has actually asked for a discount. */
export const hasDiscount = (discount: DiscountDraft): boolean =>
  Number(discount.value) > 0;

/**
 * What the request carries: a rate or a figure, never the money it resolved to.
 *
 * The server recomputes the money from its own price, so sending the resolved
 * figure would be sending it a number it is about to ignore — and inviting the
 * two to disagree about which one was authoritative.
 */
export const toDiscountRequest = (
  discount: DiscountDraft
): { kind: DiscountKind; value: number } | null =>
  hasDiscount(discount)
    ? { kind: discount.kind, value: Number(discount.value) }
    : null;
