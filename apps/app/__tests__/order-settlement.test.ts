import { describe, expect, it } from "vitest";
import {
  isOwed,
  type PaymentLeg,
  settlementOf,
  visibleLegCount,
} from "@/lib/orders";

/**
 * What the checkout panel shows as the desk types: how much each leg covers,
 * what is still short, and when the next leg's row should appear.
 *
 * The server recomputes all of it from its own prices — this exists so the
 * qoldiq on screen matches what will actually be recorded, and it is tested
 * because a figure that disagrees with the server is worse than no figure.
 */

const TOTAL = 50_000;

const leg = (method: PaymentLeg["method"], amount = ""): PaymentLeg => ({
  amount,
  method,
});

describe("settlementOf", () => {
  it("covers the whole total with a lone blank leg", () => {
    const result = settlementOf(TOTAL, [leg("cash")]);

    expect(result.paid).toBe(TOTAL);
    expect(result.remaining).toBe(0);
  });

  it("leaves the rest short when the only leg is a part payment", () => {
    const result = settlementOf(TOTAL, [leg("cash", "20000")]);

    expect(result.applied).toEqual([20_000]);
    expect(result.remaining).toBe(30_000);
  });

  it("gives the last blank leg whatever the earlier ones left", () => {
    const result = settlementOf(TOTAL, [leg("cash", "20000"), leg("card")]);

    expect(result.applied).toEqual([20_000, 30_000]);
    expect(result.remaining).toBe(0);
  });

  it("splits three ways", () => {
    const result = settlementOf(TOTAL, [
      leg("cash", "20000"),
      leg("card", "15000"),
      leg("cash"),
    ]);

    expect(result.applied).toEqual([20_000, 15_000, 15_000]);
    expect(result.remaining).toBe(0);
  });

  it("takes nothing on an empty qarz and leaves the whole total short", () => {
    const result = settlementOf(TOTAL, [leg("debt")]);

    expect(result.paid).toBe(0);
    expect(result.remaining).toBe(TOTAL);
  });

  it("takes a part payment typed against a qarz, and owes the rest", () => {
    const result = settlementOf(TOTAL, [leg("debt", "20000")]);

    expect(result.paid).toBe(20_000);
    expect(result.remaining).toBe(30_000);
  });

  it("stops at a leg that takes nothing, ignoring anything after it", () => {
    const result = settlementOf(TOTAL, [
      leg("cash", "20000"),
      leg("debt"),
      leg("card"),
    ]);

    expect(result.applied).toEqual([20_000, 0, 0]);
    expect(result.remaining).toBe(30_000);
  });

  it("caps a leg at what is outstanding rather than overpaying", () => {
    const result = settlementOf(TOTAL, [leg("cash", "60000")]);

    expect(result.applied).toEqual([TOTAL]);
    expect(result.remaining).toBe(0);
  });

  it("treats an unreadable amount as nothing tendered", () => {
    const result = settlementOf(TOTAL, [leg("cash", "abc")]);

    expect(result.paid).toBe(0);
    expect(result.remaining).toBe(TOTAL);
  });
});

describe("visibleLegCount", () => {
  it("shows one row for an ordinary sale", () => {
    expect(visibleLegCount(TOTAL, [leg("cash")])).toBe(1);
  });

  it("opens a second row the moment the first is short", () => {
    expect(visibleLegCount(TOTAL, [leg("cash", "20000")])).toBe(2);
  });

  it("opens a third row when the second is short too", () => {
    expect(
      visibleLegCount(TOTAL, [leg("cash", "20000"), leg("card", "15000")])
    ).toBe(3);
  });

  it("stops at three, however short the sale still is", () => {
    expect(
      visibleLegCount(TOTAL, [
        leg("cash", "10000"),
        leg("card", "10000"),
        leg("cash", "10000"),
      ])
    ).toBe(3);
  });

  it("opens no further row once a qarz or a comp has answered for the rest", () => {
    expect(visibleLegCount(TOTAL, [leg("cash", "20000"), leg("debt")])).toBe(2);
    expect(visibleLegCount(TOTAL, [leg("cash", "20000"), leg("free")])).toBe(2);
  });

  it("closes the second row again when the first covers the lot", () => {
    // The operator typed 20 000, got a second row, then cleared the box.
    expect(visibleLegCount(TOTAL, [leg("cash"), leg("card")])).toBe(1);
  });
});

describe("isOwed", () => {
  it("is true while something is short and nobody has waived it", () => {
    expect(isOwed(TOTAL, [leg("cash", "20000")])).toBe(true);
    expect(isOwed(TOTAL, [leg("debt")])).toBe(true);
  });

  it("is false once the legs cover the total", () => {
    expect(isOwed(TOTAL, [leg("cash", "20000"), leg("card")])).toBe(false);
  });

  it("is false when the rest is written off", () => {
    expect(isOwed(TOTAL, [leg("cash", "20000"), leg("free")])).toBe(false);
  });
});
