import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALL_TIME_START,
  RANGE_PRESETS,
  rangeForPreset,
} from "../src/features/workers/types";

/**
 * The staff table's date range.
 *
 * Every figure on that table — hours, earned, paid, balance — is computed over
 * the range rather than being a standing total, so which range the page opens
 * on decides what "Qoldiq" means. It opens on **this month**, because wages are
 * settled by the month and the pay window books a payment against one.
 */

const NOW = new Date(2026, 6, 29);

describe("all time", () => {
  it("starts on the date the books begin", () => {
    // A fixed start, not an open one: `earnedOver` prorates a monthly salary
    // across the days in range, so an unbounded start would accrue wages back
    // to the epoch and every balance would be nonsense.
    expect(ALL_TIME_START).toBe("2026-01-01");
    expect(rangeForPreset("all-time", NOW).from).toBe(ALL_TIME_START);
  });

  it("runs to today rather than to a month end", () => {
    expect(rangeForPreset("all-time", NOW).to).toBe("2026-07-29");
  });

  it("is offered before the narrower windows", () => {
    expect(RANGE_PRESETS[0]).toBe("all-time");
  });
});

describe("the staff route", () => {
  // Anchored to this file, not to `process.cwd()` — the working directory
  // differs between `pnpm --filter web test` and a root-level vitest run.
  const source = readFileSync(
    join(import.meta.dirname, "../src/routes/_authed/workers.tsx"),
    "utf8"
  );

  it("opens on the current month, the one a wage is settled against", () => {
    /*
     * Asserted against the source because the fallback is a `.catch()` on the
     * search schema — it only shows up on a request with no `range=`, which is
     * every first visit and no test that passes one.
     */
    expect(source).toContain('.catch("this-month")');
  });
});

describe("the other presets still bound their own windows", () => {
  it("keeps this month inside this month", () => {
    expect(rangeForPreset("this-month", NOW)).toEqual({
      from: "2026-07-01",
      to: "2026-07-31",
    });
  });

  it("keeps last month inside last month", () => {
    expect(rangeForPreset("last-month", NOW)).toEqual({
      from: "2026-06-01",
      to: "2026-06-30",
    });
  });

  it("leaves custom for the caller to fill in", () => {
    expect(rangeForPreset("custom", NOW)).toEqual({ from: "", to: "" });
  });
});
