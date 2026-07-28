import { describe, expect, it } from "vitest";
import { settleMembership } from "../src/services/member.service.js";
import { settleCheckout } from "../src/services/order.service.js";

/**
 * The two calculations that decide where money goes.
 *
 * Both are pure and tested directly rather than through a mocked db, for the
 * same reason `summariseCashboxes` is: a sale that credits the wrong till, or
 * credits no till at all, is wrong in the way nothing on screen would show.
 *
 * The invariant behind every case below: **the rows always add up to what the
 * buyer actually handed over, and each till is named.** Money that reaches a
 * drawer must reach exactly one, under the name of the drawer it went into.
 */

const TOTAL = 50_000;

/** What the tills are credited with in total. */
const booked = (rows: readonly { amount: number }[]): number =>
  rows.reduce((sum, row) => sum + row.amount, 0);

describe("settleCheckout", () => {
  it("books the whole total to one till when a lone leg has no amount", () => {
    const result = settleCheckout(TOTAL, [{ method: "cash" }]);

    expect(result.rows).toEqual([{ amount: TOTAL, method: "cash" }]);
    expect(result.isSettled).toBe(true);
    expect(result.remainder).toBe(0);
  });

  it("books nothing on a qarz and leaves the whole total owing", () => {
    const result = settleCheckout(TOTAL, [{ method: "debt" }]);

    expect(result.rows).toEqual([]);
    expect(result.isSettled).toBe(false);
    expect(result.remainder).toBe(TOTAL);
  });

  it("leaves the qoldiq owing when the legs simply run out", () => {
    const result = settleCheckout(TOTAL, [{ amount: "20000", method: "cash" }]);

    expect(result.rows).toEqual([{ amount: 20_000, method: "cash" }]);
    expect(result.isSettled).toBe(false);
    expect(result.remainder).toBe(30_000);
    expect(booked(result.rows)).toBe(20_000);
  });

  it("splits two ways, crediting each till with its own share", () => {
    const result = settleCheckout(TOTAL, [
      { amount: "20000", method: "cash" },
      { method: "card" },
    ]);

    expect(result.rows).toEqual([
      { amount: 20_000, method: "cash" },
      { amount: 30_000, method: "card" },
    ]);
    expect(result.isSettled).toBe(true);
    expect(booked(result.rows)).toBe(TOTAL);
  });

  it("splits three ways, the last leg taking whatever is left", () => {
    const result = settleCheckout(TOTAL, [
      { amount: "20000", method: "cash" },
      { amount: "15000", method: "card" },
      { method: "cash" },
    ]);

    expect(result.rows).toEqual([
      { amount: 20_000, method: "cash" },
      { amount: 15_000, method: "card" },
      { amount: 15_000, method: "cash" },
    ]);
    expect(result.isSettled).toBe(true);
    expect(booked(result.rows)).toBe(TOTAL);
  });

  it("leaves the tail of a three-way split owing when it is a qarz", () => {
    const result = settleCheckout(TOTAL, [
      { amount: "20000", method: "cash" },
      { amount: "15000", method: "card" },
      { method: "debt" },
    ]);

    expect(booked(result.rows)).toBe(35_000);
    expect(result.remainder).toBe(15_000);
    expect(result.isSettled).toBe(false);
  });

  it("settles a waived tail without crediting a till for it", () => {
    const result = settleCheckout(TOTAL, [
      { amount: "20000", method: "cash" },
      { method: "free" },
    ]);

    expect(result.isSettled).toBe(true);
    expect(booked(result.rows)).toBe(20_000);
    // The zero row is the only record that somebody stopped chasing the rest.
    expect(result.rows.at(-1)).toEqual({ amount: 0, method: "free" });
  });

  it("records a comp as a zero row, not as a sale settled off the books", () => {
    const result = settleCheckout(TOTAL, [{ method: "free" }]);

    expect(result.rows).toEqual([{ amount: 0, method: "free" }]);
    expect(result.isSettled).toBe(true);
  });

  it("stops at a leg that takes nothing, ignoring anything after it", () => {
    const result = settleCheckout(TOTAL, [
      { amount: "20000", method: "cash" },
      { method: "debt" },
      { method: "card" },
    ]);

    expect(booked(result.rows)).toBe(20_000);
    expect(result.remainder).toBe(30_000);
  });

  it("never credits a till twice once the total is covered", () => {
    const result = settleCheckout(TOTAL, [
      { method: "cash" },
      { method: "card" },
    ]);

    expect(result.rows).toEqual([{ amount: TOTAL, method: "cash" }]);
    expect(booked(result.rows)).toBe(TOTAL);
  });

  it("caps a leg at what is outstanding rather than booking a credit", () => {
    const result = settleCheckout(TOTAL, [{ amount: "60000", method: "cash" }]);

    expect(booked(result.rows)).toBe(TOTAL);
    expect(result.remainder).toBe(0);
  });

  it("ignores a shortfall of small change rather than owing a fraction", () => {
    const result = settleCheckout(TOTAL, [
      { amount: String(TOTAL - 0.004), method: "cash" },
    ]);

    expect(result.remainder).toBe(0);
    expect(result.isSettled).toBe(true);
  });

  it("never books a negative amount", () => {
    const result = settleCheckout(TOTAL, [{ amount: "-5000", method: "cash" }]);

    expect(booked(result.rows)).toBe(0);
    expect(result.remainder).toBe(TOTAL);
  });
});

describe("settleMembership", () => {
  const PRICE = 500_000;

  it("charges the list price and books it when a lone leg has no amount", () => {
    const result = settleMembership(PRICE, [{ method: "cash" }]);

    expect(result.charged).toBe(PRICE);
    expect(result.rows).toEqual([{ amount: PRICE, method: "cash" }]);
  });

  it("charges the list price and books nothing on a qarz", () => {
    const result = settleMembership(PRICE, [{ method: "debt" }]);

    // The price stands: that is what makes it a debt rather than a gift.
    expect(result.charged).toBe(PRICE);
    expect(result.rows).toEqual([]);
  });

  it("books only the part payment, leaving the rest owed", () => {
    const result = settleMembership(PRICE, [
      { amount: "200000", method: "cash" },
    ]);

    expect(result.charged).toBe(PRICE);
    expect(booked(result.rows)).toBe(200_000);
  });

  it("splits two ways, crediting each till with its own share", () => {
    const result = settleMembership(PRICE, [
      { amount: "200000", method: "cash" },
      { method: "card" },
    ]);

    expect(result.rows).toEqual([
      { amount: 200_000, method: "cash" },
      { amount: 300_000, method: "card" },
    ]);
    // Nothing left owing, and the whole price reached the tills.
    expect(booked(result.rows)).toBe(result.charged);
  });

  it("splits three ways, the last leg taking whatever is left", () => {
    const result = settleMembership(PRICE, [
      { amount: "200000", method: "cash" },
      { amount: "150000", method: "card" },
      { method: "cash" },
    ]);

    expect(booked(result.rows)).toBe(PRICE);
    expect(result.rows).toHaveLength(3);
  });

  it("discounts a waived tail down to what was actually taken", () => {
    const result = settleMembership(PRICE, [
      { amount: "200000", method: "cash" },
      { method: "free" },
    ]);

    // Recorded at what was charged, so `price - paid` chases nobody.
    expect(result.charged).toBe(200_000);
    expect(booked(result.rows)).toBe(200_000);
  });

  it("charges nothing for a comp and books nothing", () => {
    const result = settleMembership(PRICE, [{ method: "free" }]);

    expect(result.charged).toBe(0);
    expect(result.rows).toEqual([]);
  });

  it("takes a qarz at nothing however much the client claims was paid", () => {
    const result = settleMembership(PRICE, [
      { amount: "200000", method: "debt" },
    ]);

    expect(result.rows).toEqual([]);
    expect(result.charged).toBe(PRICE);
  });

  it("never books more than the plan asks", () => {
    const result = settleMembership(PRICE, [
      { amount: "900000", method: "cash" },
    ]);

    expect(booked(result.rows)).toBe(PRICE);
  });
});
