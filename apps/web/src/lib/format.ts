/**
 * Display formatting shared across features.
 *
 * `Intl` formatters are expensive to construct and are created once at module
 * scope rather than per call — these run inside table rows, so "once per render
 * of a hundred rows" is a real cost.
 */

/*
 * `en-US`, matching what apps/app has always rendered — comma groups, not
 * spaces. This briefly read `ru-RU` here, which silently restyled every price
 * in the product from "300,000 UZS" to "300 000 UZS". Locale is a product
 * decision; do not change it to match the UI language without being asked.
 */
const AMOUNT_FORMAT = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

/**
 * `"10000.00"` -> `"10,000 UZS"`.
 *
 * Money as the front desk reads it. Null and unparseable both render as an
 * em dash rather than "0" — a missing price and a free plan are different
 * things, and showing them the same way loses the distinction.
 */
export const formatMoney = (value: string | null): string => {
  if (value === null) {
    return "—";
  }

  const amount = Number(value);

  return Number.isFinite(amount) ? `${AMOUNT_FORMAT.format(amount)} UZS` : "—";
};
