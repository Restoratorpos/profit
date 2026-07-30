import { describe, expect, it } from "vitest";
import { cappedDiscount, discountOf } from "../src/lib/discount.js";
import { settleMembership } from "../src/services/member.service.js";

/**
 * What a discount takes off, and what is left owed afterwards.
 *
 * Pure and tested directly, like the settlement calculations beside it: a
 * discount that resolves to the wrong figure is wrong in the way nothing on
 * screen would show — the sale looks settled, the till balances, and a member is
 * quietly chased for money the desk agreed to take off, or not chased for money
 * it did not.
 *
 * The invariant behind every case: **a discount never makes a sale negative and
 * never turns into a credit.** It reduces what is owed, down to zero, and stops.
 */

const PRICE = 400_000;

describe("discountOf", () => {
  it("resolves a percentage against the gross", () => {
    expect(discountOf(PRICE, { kind: "percent", value: 10 })).toBe(40_000);
  });

  it("takes an amount as the money it says", () => {
    expect(discountOf(PRICE, { kind: "amount", value: 50_000 })).toBe(50_000);
  });

  it("is nothing when no discount was given", () => {
    expect(discountOf(PRICE, null)).toBe(0);
    expect(discountOf(PRICE, undefined)).toBe(0);
  });

  it("caps an amount at the sale rather than refusing it", () => {
    // "Take 500,000 off" a 400,000 sale is a whole discount, not an error — and
    // must not leave a negative total behind for somebody to be credited with.
    expect(discountOf(PRICE, { kind: "amount", value: 500_000 })).toBe(PRICE);
  });

  it("treats a full percentage as the whole sale", () => {
    expect(discountOf(PRICE, { kind: "percent", value: 100 })).toBe(PRICE);
  });

  it("ignores a negative discount rather than charging more for it", () => {
    expect(discountOf(PRICE, { kind: "amount", value: -10_000 })).toBe(0);
    expect(discountOf(PRICE, { kind: "percent", value: -10 })).toBe(0);
  });

  it("has nothing to take off a sale that is already zero", () => {
    expect(discountOf(0, { kind: "percent", value: 50 })).toBe(0);
    expect(discountOf(0, { kind: "amount", value: 50_000 })).toBe(0);
  });

  it("rounds to the two decimals the money columns carry", () => {
    // A third off 10,000 is 3,333.333… — stored at more precision it would not
    // add back up to the total it was taken from.
    expect(discountOf(10_000, { kind: "percent", value: 33.333 })).toBe(3333.3);
  });
});

describe("discountOf against an outstanding balance", () => {
  /*
   * The settle-time discount resolves against what is still owed, not the
   * original sale — "settle it for 400 and we'll call it square" is a discount on
   * the balance in front of the desk. These are the figures `payMemberOrders`
   * forgives with, so they are worth stating separately from the checkout case.
   */
  const OWED = 542_000;

  it("forgives a percentage of the balance, not of the original sale", () => {
    expect(discountOf(OWED, { kind: "percent", value: 10 })).toBe(54_200);
  });

  it("clears the balance when the figure covers all of it", () => {
    expect(discountOf(OWED, { kind: "amount", value: 600_000 })).toBe(OWED);
  });

  it("leaves the balance alone when nothing is being forgiven", () => {
    expect(discountOf(OWED, null)).toBe(0);
  });

  it("has nothing to forgive on a settled balance", () => {
    // The drawer refuses to open the pay panel at zero owed, and the arithmetic
    // agrees rather than relying on the screen to prevent it.
    expect(discountOf(0, { kind: "percent", value: 50 })).toBe(0);
  });
});

describe("cappedDiscount", () => {
  it("keeps the figure when the sale still covers it", () => {
    expect(cappedDiscount(PRICE, 50_000)).toBe(50_000);
  });

  it("shrinks with an order that has shrunk below it", () => {
    // The lines were edited down to 30,000 after 50,000 had been discounted.
    // Keeping 50,000 off would owe the member 20,000.
    expect(cappedDiscount(30_000, 50_000)).toBe(30_000);
  });

  it("is nothing on an order emptied out completely", () => {
    expect(cappedDiscount(0, 50_000)).toBe(0);
  });

  it("ignores a discount that was never given", () => {
    expect(cappedDiscount(PRICE, 0)).toBe(0);
  });
});

describe("settleMembership with a discount", () => {
  it("charges the discounted price and books what was handed over", () => {
    const result = settleMembership(PRICE, [{ method: "cash" }], 50_000);

    expect(result.charged).toBe(350_000);
    expect(result.discount).toBe(50_000);
    expect(result.rows).toEqual([{ amount: 350_000, method: "cash" }]);
  });

  it("leaves only the discounted remainder owing on a part payment", () => {
    // 400,000 less 50,000 discount, 100,000 handed over: the debt is 250,000,
    // not the 300,000 the list price would have implied.
    const result = settleMembership(
      PRICE,
      [{ amount: "100000", method: "cash" }],
      50_000
    );

    expect(result.charged).toBe(350_000);
    expect(result.rows).toEqual([{ amount: 100_000, method: "cash" }]);
    expect(result.charged - 100_000).toBe(250_000);
  });

  it("owes the discounted price on a qarz, not the list price", () => {
    const result = settleMembership(PRICE, [{ method: "debt" }], 50_000);

    expect(result.charged).toBe(350_000);
    expect(result.rows).toEqual([]);
  });

  it("charges nothing when the discount is the whole price", () => {
    const result = settleMembership(PRICE, [{ method: "cash" }], PRICE);

    expect(result.charged).toBe(0);
    expect(result.discount).toBe(PRICE);
    // Nothing was outstanding, so no till is credited — the same as a comp.
    expect(result.rows).toEqual([]);
  });

  it("keeps a comp and a discount apart when both are on one sale", () => {
    // Half off, then the rest waived: charged is what was actually taken, and the
    // discount stays the figure the desk entered rather than absorbing the comp.
    const result = settleMembership(
      PRICE,
      [{ amount: "100000", method: "cash" }, { method: "free" }],
      200_000
    );

    expect(result.discount).toBe(200_000);
    expect(result.charged).toBe(100_000);
    expect(result.rows).toEqual([{ amount: 100_000, method: "cash" }]);
  });

  it("behaves exactly as before when no discount is given", () => {
    const result = settleMembership(PRICE, [{ method: "cash" }]);

    expect(result.charged).toBe(PRICE);
    expect(result.discount).toBe(0);
    expect(result.rows).toEqual([{ amount: PRICE, method: "cash" }]);
  });
});
