import { describe, expect, it } from "vitest";
import {
  canTypeAmount,
  isFinalLeg,
  needsTill,
  type PaymentLeg,
  toPayments,
  visibleLegCount,
  withLeg,
} from "@/lib/payment-legs";

/**
 * Splitting a sale across more than one payment — the part both the shop
 * checkout and the plan sale share.
 */

const TOTAL = 100_000;

const leg = (method: PaymentLeg["method"], amount = ""): PaymentLeg => ({
  amount,
  method,
});

describe("withLeg", () => {
  it("creates the leg a row is offering before anybody has touched it", () => {
    // The regression this file exists for: the second row is drawn from a
    // placeholder, so the first tap on it lands on an index the state has never
    // held. Patching with `map` alone dropped it, and the control read as dead.
    const legs = withLeg(TOTAL, [leg("cash", "40000")], 1, { method: "card" });

    expect(legs).toHaveLength(2);
    expect(legs[1].method).toBe("card");
  });

  it("creates the third row the same way", () => {
    const legs = withLeg(
      TOTAL,
      [leg("cash", "40000"), leg("card", "30000")],
      2,
      { method: "debt" }
    );

    expect(legs).toHaveLength(3);
    expect(legs[2].method).toBe("debt");
  });

  it("keeps the legs before and after the one being written", () => {
    const legs = withLeg(
      TOTAL,
      [leg("cash", "40000"), leg("card", "30000"), leg("cash")],
      1,
      { amount: "20000" }
    );

    expect(legs[0]).toEqual(leg("cash", "40000"));
    expect(legs[1]).toEqual(leg("card", "20000"));
    expect(legs[2]).toEqual(leg("cash"));
  });

  it("writes an amount without disturbing the method", () => {
    const legs = withLeg(TOTAL, [leg("card", "10000")], 0, { amount: "25000" });

    expect(legs[0]).toEqual(leg("card", "25000"));
  });

  it("drops the legs a change made pointless", () => {
    // The first leg goes back to covering everything, so the card payment that
    // was sitting on the second row must not survive to be submitted.
    const legs = withLeg(TOTAL, [leg("cash", "40000"), leg("card")], 0, {
      amount: "",
    });

    expect(legs).toHaveLength(1);
  });

  it("keeps the leg being written even when it covers the whole sale", () => {
    const legs = withLeg(TOTAL, [leg("cash", "40000"), leg("card")], 1, {
      amount: "60000",
    });

    expect(legs).toHaveLength(2);
    expect(legs[1]).toEqual(leg("card", "60000"));
  });

  it("drops the third row when a qarz on the second answers for the rest", () => {
    const legs = withLeg(
      TOTAL,
      [leg("cash", "40000"), leg("card", "10000"), leg("cash")],
      1,
      { method: "debt" }
    );

    expect(legs).toHaveLength(2);
  });
});

describe("visibleLegCount", () => {
  it("opens the next row as each one falls short, and stops at three", () => {
    expect(visibleLegCount(TOTAL, [leg("cash")])).toBe(1);
    expect(visibleLegCount(TOTAL, [leg("cash", "40000")])).toBe(2);
    expect(
      visibleLegCount(TOTAL, [leg("cash", "40000"), leg("card", "30000")])
    ).toBe(3);
    expect(
      visibleLegCount(TOTAL, [
        leg("cash", "10000"),
        leg("card", "10000"),
        leg("cash", "10000"),
      ])
    ).toBe(3);
  });
});

describe("isFinalLeg", () => {
  it("is only the third — the one that cannot be typed into", () => {
    expect(isFinalLeg(0)).toBe(false);
    expect(isFinalLeg(1)).toBe(false);
    expect(isFinalLeg(2)).toBe(true);
  });
});

/**
 * A qarz with a figure typed against it: the desk saying "this sale is on
 * credit, but they are handing over this much now". The same sale as a till leg
 * with a qarz behind it, entered from the other end.
 */
describe("a part payment against a qarz", () => {
  it("lets an amount be typed — only a comp charges nothing", () => {
    expect(canTypeAmount("debt")).toBe(true);
    expect(canTypeAmount("cash")).toBe(true);
    expect(canTypeAmount("free")).toBe(false);
  });

  it("asks which drawer the money went into, once there is money", () => {
    expect(needsTill(leg("debt"), 0)).toBe(false);
    expect(needsTill(leg("debt", "40000"), 0)).toBe(true);
    // A till leg already names its own drawer.
    expect(needsTill(leg("cash", "40000"), 0)).toBe(false);
    // The final leg's qarz is the tail of the sale, not a payment.
    expect(needsTill(leg("debt", "40000"), 2)).toBe(false);
  });

  it("records the payment against that drawer, and the balance behind it", () => {
    expect(
      toPayments([{ amount: "40000", method: "debt", till: "card" }])
    ).toEqual([
      { amount: "40000", method: "card" },
      { amount: undefined, method: "debt" },
    ]);
  });

  it("falls back to cash when no drawer was chosen", () => {
    expect(toPayments([leg("debt", "40000")])).toEqual([
      { amount: "40000", method: "cash" },
      { amount: undefined, method: "debt" },
    ]);
  });

  it("stays a single qarz when nothing was handed over", () => {
    expect(toPayments([leg("debt")])).toEqual([
      { amount: undefined, method: "debt" },
    ]);
  });

  it("sends an ordinary sale as one leg with no amount", () => {
    expect(toPayments([leg("cash")])).toEqual([
      { amount: undefined, method: "cash" },
    ]);
  });

  it("sends a split as the legs the desk entered", () => {
    expect(toPayments([leg("cash", "40000"), leg("card")])).toEqual([
      { amount: "40000", method: "cash" },
      { amount: undefined, method: "card" },
    ]);
  });

  it("offers no further row: the qarz already answered for the rest", () => {
    expect(visibleLegCount(TOTAL, [leg("debt", "40000")])).toBe(1);
  });
});
