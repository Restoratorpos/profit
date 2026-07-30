import { z } from "zod";

/**
 * A discount as the desk entered it: a rate or a figure.
 *
 * Shared by the shop-order and membership-sale schemas rather than restated in
 * each, which is the opposite of what `paymentLegSchema` does — and deliberately
 * so. The two domains' payment legs genuinely differ (a shop sale's methods are
 * not a plan sale's), while a discount is the same idea and the same bounds in
 * both. Two copies of a numeric bound is a drift waiting to happen.
 *
 * A discriminated union rather than one shape carrying a `kind`, so each bound
 * belongs to the case it constrains: a percentage over 100 is nonsense, while an
 * amount needs no ceiling here — `discountOf` caps it at the sale itself, because
 * "take 50,000 off" against a 30,000 sale is a whole discount, not an error.
 */
export const discountSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("percent"),
    value: z.number().min(0).max(100, "A discount cannot exceed 100%"),
  }),
  z.object({
    kind: z.literal("amount"),
    value: z.number().min(0),
  }),
]);

export type DiscountRequest = z.infer<typeof discountSchema>;
