import { describe, expect, it } from "vitest";
import { formatAmountInput, toBareAmount } from "../src/lib/money";

/**
 * Guards the one rule an amount box has to keep: grouping is paint, and what
 * leaves the field is always bare.
 *
 * The bug worth not reintroducing is the round trip. `formatAmountInput` puts
 * commas in for reading; if `toBareAmount` did not take them back out, the
 * separators would accumulate into state on the next keystroke and the value
 * posted to the backend would be "500,000" — which fails a numeric coercion
 * rather than failing visibly.
 */

describe("toBareAmount", () => {
  it("strips the separators its own formatter added", () => {
    expect(toBareAmount(formatAmountInput("500000"))).toBe("500000");
    expect(toBareAmount(formatAmountInput("2096500"))).toBe("2096500");
  });

  it("drops anything that is not a digit or a point", () => {
    expect(toBareAmount("1 234 UZS")).toBe("1234");
    expect(toBareAmount("abc")).toBe("");
  });

  it("keeps a trailing point so the decimals can still be typed", () => {
    // Swallowing it would make the key press look like it did nothing.
    expect(toBareAmount("500.")).toBe("500.");
    expect(toBareAmount("500.5")).toBe("500.5");
  });

  it("treats a second point as overshoot, not a second separator", () => {
    expect(toBareAmount("1.2.3")).toBe("1.23");
  });

  it("caps a pasted wall of digits before Number() loses precision", () => {
    expect(toBareAmount("9".repeat(40))).toBe("9".repeat(15));
  });
});

describe("formatAmountInput", () => {
  it("groups with the separator formatMoney uses", () => {
    // Commas, not spaces. A field that grouped differently from the total
    // printed under it read as two different applications.
    expect(formatAmountInput("500000")).toBe("500,000");
  });

  it("leaves an empty box empty rather than filling it with zero", () => {
    expect(formatAmountInput("")).toBe("");
  });

  it("groups only the whole part", () => {
    expect(formatAmountInput("1234567.89")).toBe("1,234,567.89");
    expect(formatAmountInput("500.")).toBe("500.");
  });

  it("survives a value that is only a fraction", () => {
    expect(formatAmountInput(".5")).toBe(".5");
  });
});
