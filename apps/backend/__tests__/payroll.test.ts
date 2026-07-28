import { describe, expect, it } from "vitest";
import {
  coveredDaysOfMonth,
  daysInMonth,
  monthKey,
  monthRange,
  monthsInRange,
  PERIOD_PATTERN,
  salaryPeriodOf,
  salaryPeriodTag,
} from "../src/lib/payroll.js";

/**
 * The month a wage settles is written into `expenses.action_id`, so these
 * cover the round trip and the day arithmetic that prorates a monthly salary.
 * All of it is pure — no database, no app.
 */

describe("salary period tags", () => {
  it("round-trips a period", () => {
    expect(salaryPeriodOf(salaryPeriodTag("2026-07"))).toBe("2026-07");
  });

  it("reads no period from a wage typed on the cashbox screen", () => {
    expect(salaryPeriodOf(null)).toBeNull();
  });

  it("ignores an action id belonging to another screen", () => {
    // A delivery id. Reading a period out of it would file a supplier payment
    // against a month.
    expect(salaryPeriodOf("V1StGXR8_Z5jdHi6B-my")).toBeNull();
  });

  it("rejects a tag whose month is not a month", () => {
    expect(salaryPeriodOf("salary:2026-13")).toBeNull();
    expect(salaryPeriodOf("salary:2026-7")).toBeNull();
  });

  it("accepts only YYYY-MM", () => {
    expect(PERIOD_PATTERN.test("2026-01")).toBe(true);
    expect(PERIOD_PATTERN.test("2026-12")).toBe(true);
    expect(PERIOD_PATTERN.test("2026-00")).toBe(false);
    expect(PERIOD_PATTERN.test("26-07")).toBe(false);
  });
});

describe("months", () => {
  it("keys a date by its local month", () => {
    expect(monthKey(new Date(2026, 6, 28))).toBe("2026-07");
  });

  it("spans a month from its first day to its last instant", () => {
    const range = monthRange("2026-02");

    expect(range.from.getDate()).toBe(1);
    expect(range.to.getDate()).toBe(28);
    expect(range.to.getHours()).toBe(23);
  });

  it("counts the days of a leap February", () => {
    expect(daysInMonth("2028-02")).toBe(29);
    expect(daysInMonth("2026-02")).toBe(28);
  });

  it("lists every month a range touches, ends included", () => {
    expect(monthsInRange(new Date(2026, 5, 20), new Date(2026, 7, 3))).toEqual([
      "2026-06",
      "2026-07",
      "2026-08",
    ]);
  });

  it("lists one month for a range inside it", () => {
    expect(monthsInRange(new Date(2026, 6, 3), new Date(2026, 6, 9))).toEqual([
      "2026-07",
    ]);
  });

  it("lists nothing for a backwards range", () => {
    expect(monthsInRange(new Date(2026, 6, 9), new Date(2026, 6, 3))).toEqual(
      []
    );
  });
});

describe("prorating a monthly salary", () => {
  const wholeJuly = { from: new Date(2026, 6, 1), to: new Date(2026, 6, 31) };

  it("covers a whole month, so the whole salary is earned", () => {
    expect(coveredDaysOfMonth("2026-07", wholeJuly, null)).toBe(
      daysInMonth("2026-07")
    );
  });

  it("covers only the days in range", () => {
    expect(
      coveredDaysOfMonth(
        "2026-07",
        { from: new Date(2026, 6, 1), to: new Date(2026, 6, 10) },
        null
      )
    ).toBe(10);
  });

  it("starts at the hire date for somebody taken on mid-month", () => {
    // Hired on the 20th: the 20th to the 31st, inclusive, is 12 days.
    expect(
      coveredDaysOfMonth("2026-07", wholeJuly, new Date(2026, 6, 20))
    ).toBe(12);
  });

  it("owes nothing for a month before the hire date", () => {
    expect(
      coveredDaysOfMonth(
        "2026-06",
        { from: new Date(2026, 5, 1), to: new Date(2026, 5, 30) },
        new Date(2026, 6, 20)
      )
    ).toBe(0);
  });

  it("ignores a hire date already in the past", () => {
    expect(coveredDaysOfMonth("2026-07", wholeJuly, new Date(2025, 0, 5))).toBe(
      31
    );
  });

  it("counts a single day as a day, not nothing", () => {
    expect(
      coveredDaysOfMonth(
        "2026-07",
        { from: new Date(2026, 6, 15), to: new Date(2026, 6, 15, 23, 59) },
        null
      )
    ).toBe(1);
  });

  it("counts only its own month's share of a range spanning two", () => {
    const range = { from: new Date(2026, 6, 25), to: new Date(2026, 7, 5) };

    expect(coveredDaysOfMonth("2026-07", range, null)).toBe(7);
    expect(coveredDaysOfMonth("2026-08", range, null)).toBe(5);
  });
});
