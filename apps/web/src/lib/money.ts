/**
 * Typing money.
 *
 * Grouping is **display-only**, the same rule the phone field follows: state
 * and the submitted value are always bare, and only what is on screen carries
 * separators. A formatted string that reached the backend would arrive as
 * "500,000" and fail its numeric coercion — so nothing here ever hands a
 * grouped string back to a caller.
 *
 * The separator matches `formatMoney`, deliberately. An amount field that
 * groups with spaces sitting directly above a total that groups with commas
 * reads as two different applications stitched together, which is exactly what
 * it was before this existed.
 */

const GROUP_FORMAT = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

/**
 * Longer than any amount the schema accepts (the column tops out just under a
 * trillion), so this only ever bites a pasted wall of digits — where it stops
 * `Number()` losing precision and rendering something the desk did not type.
 */
const MAX_WHOLE_DIGITS = 15;

/**
 * What is kept in state and submitted: digits, and at most one decimal point.
 *
 * The point survives on its own so a half-typed "500." can keep being typed;
 * dropping it on the way through would make the key press appear to do nothing
 * and the decimals impossible to reach.
 */
export const toBareAmount = (value: string): string => {
  const cleaned = value.replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");

  if (dot === -1) {
    return cleaned.slice(0, MAX_WHOLE_DIGITS);
  }

  const whole = cleaned.slice(0, dot).slice(0, MAX_WHOLE_DIGITS);
  // Any further points are the user overshooting, not a second separator.
  const fraction = cleaned.slice(dot + 1).replace(/\./g, "");

  return `${whole}.${fraction}`;
};

/**
 * `"500000"` -> `"500,000"`.
 *
 * Empty in, empty out — never "0", so a cleared box stays cleared rather than
 * refilling itself with a figure the operator did not type.
 */
export const formatAmountInput = (bare: string): string => {
  if (bare.length === 0) {
    return "";
  }

  const [whole, fraction] = bare.split(".");
  const grouped = whole.length > 0 ? GROUP_FORMAT.format(Number(whole)) : "";

  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
};

const AMOUNT_CHAR = /[\d.]/;

/**
 * Whether a character survives `toBareAmount`.
 *
 * This is what lets the caret be restored after a reformat: the separators the
 * grouping inserts are not value, so the caret is remembered as "how many real
 * characters precede it" rather than as an offset into a string whose length
 * changes under it.
 */
export const isAmountChar = (character: string): boolean =>
  AMOUNT_CHAR.test(character);
