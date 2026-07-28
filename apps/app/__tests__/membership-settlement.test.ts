import { describe, expect, it } from "vitest";
import { type PaymentLeg, settlementOf, visibleLegCount } from "@/lib/members";

/**
 * What the plan-sale sheet shows as the desk types: what each leg covers, what
 * the membership is recorded as costing, and what the member still owes.
 *
 * The server recomputes all of it from the plan's own price — this exists so
 * the figures on screen match what will actually be recorded, and it is tested
 * because a summary that disagrees with the server is worse than no summary.
 */

const PRICE = 300_000;

const leg = (method: PaymentLeg["method"], amount = ""): PaymentLeg => ({
  amount,
  method,
});

describe("settlementOf", () => {
  it("covers the whole price with a lone blank leg", () => {
    expect(settlementOf(PRICE, [leg("cash")])).toEqual({
      applied: [PRICE],
      debt: 0,
      paid: PRICE,
      total: PRICE,
    });
  });

  it("owes the remainder on a part payment", () => {
    expect(settlementOf(PRICE, [leg("cash", "100000")])).toEqual({
      applied: [100_000],
      debt: 200_000,
      paid: 100_000,
      total: PRICE,
    });
  });

  it("gives the last blank leg whatever the earlier ones left", () => {
    const result = settlementOf(PRICE, [leg("cash", "100000"), leg("card")]);

    expect(result.applied).toEqual([100_000, 200_000]);
    expect(result.debt).toBe(0);
  });

  it("splits three ways", () => {
    const result = settlementOf(PRICE, [
      leg("cash", "100000"),
      leg("card", "50000"),
      leg("cash"),
    ]);

    expect(result.applied).toEqual([100_000, 50_000, 150_000]);
    expect(result.debt).toBe(0);
  });

  it("owes the whole price on a qarz, and still charges it", () => {
    const result = settlementOf(PRICE, [leg("debt")]);

    // The price stands: that is what makes it a debt rather than a gift.
    expect(result.total).toBe(PRICE);
    expect(result.debt).toBe(PRICE);
    expect(result.paid).toBe(0);
  });

  it("charges nothing and owes nothing when comped", () => {
    expect(settlementOf(PRICE, [leg("free")])).toEqual({
      applied: [0],
      debt: 0,
      paid: 0,
      total: 0,
    });
  });

  it("discounts to what was taken when the rest is comped", () => {
    const result = settlementOf(PRICE, [leg("cash", "100000"), leg("free")]);

    // Recorded at what was charged, so `price - paid` chases nobody.
    expect(result.total).toBe(100_000);
    expect(result.debt).toBe(0);
  });

  it("stops at a leg that takes nothing, ignoring anything after it", () => {
    const result = settlementOf(PRICE, [
      leg("cash", "100000"),
      leg("debt"),
      leg("card"),
    ]);

    expect(result.applied).toEqual([100_000, 0, 0]);
    expect(result.debt).toBe(200_000);
  });

  it("never reports a negative debt when overpaid", () => {
    const result = settlementOf(PRICE, [leg("cash", "400000")]);

    expect(result.debt).toBe(0);
    expect(result.paid).toBe(PRICE);
  });

  it("treats an unreadable amount as nothing taken", () => {
    expect(settlementOf(PRICE, [leg("cash", "abc")]).debt).toBe(PRICE);
  });
});

describe("visibleLegCount", () => {
  it("shows one row for an ordinary sale", () => {
    expect(visibleLegCount(PRICE, [leg("cash")])).toBe(1);
  });

  it("opens a second row the moment the first is short", () => {
    expect(visibleLegCount(PRICE, [leg("cash", "100000")])).toBe(2);
  });

  it("opens a third row when the second is short too", () => {
    expect(
      visibleLegCount(PRICE, [leg("cash", "100000"), leg("card", "50000")])
    ).toBe(3);
  });

  it("stops at three, however short the sale still is", () => {
    expect(
      visibleLegCount(PRICE, [
        leg("cash", "10000"),
        leg("card", "10000"),
        leg("cash", "10000"),
      ])
    ).toBe(3);
  });

  it("opens no further row once a qarz or a comp has answered for the rest", () => {
    expect(visibleLegCount(PRICE, [leg("cash", "100000"), leg("debt")])).toBe(
      2
    );
    expect(visibleLegCount(PRICE, [leg("cash", "100000"), leg("free")])).toBe(
      2
    );
  });

  it("closes the second row again when the first covers the lot", () => {
    expect(visibleLegCount(PRICE, [leg("cash"), leg("card")])).toBe(1);
  });
});
