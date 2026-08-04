import { describe, expect, it } from "vitest";
import {
  DATE_PRESETS,
  formatDayShort,
  presetOf,
  rangeForPreset,
} from "@/features/orders/types";

/**
 * The orders screen's date filter, which used to hold one value as two.
 *
 * `preset` and `{from, to}` were separate state. Picking a preset wrote both;
 * editing a bound by hand wrote the bound and reset the highlight to "all" — so
 * the toolbar lit "no date limit" while two limits were in force, and nothing
 * could reconcile them because they were two facts about one thing.
 *
 * The bounds are now the only state and the highlight is derived from them, so
 * the disagreement is unrepresentable rather than merely fixed. These assert the
 * derivation, which is what has to keep holding.
 */

describe("which preset a range is", () => {
  it("reads no bounds as the preset that means no bounds", () => {
    // Or the toolbar would open on "custom" and read as a range nobody set.
    expect(presetOf("", "")).toBe("any");
  });

  it("reads back every preset it writes", () => {
    for (const preset of DATE_PRESETS) {
      const range = rangeForPreset(preset);

      expect(presetOf(range.from, range.to)).toBe(preset);
    }
  });

  /**
   * The bug, in one line. A hand-typed bound must match no preset — it used to
   * leave the highlight on "all", which is the state meaning *unfiltered*.
   */
  it("matches no preset once a bound is typed by hand", () => {
    expect(presetOf("2020-01-01", "")).toBe("custom");
    expect(presetOf("2020-01-01", "2020-06-30")).toBe("custom");
  });
});

describe("the preset identifiers", () => {
  /**
   * The identifier half of the collision. `OrderFilter` has an `"all"` and
   * `DatePreset` had one too, forty lines apart in one file meaning "all
   * statuses" and "all time" — which is how two buttons both reading "Barchasi"
   * ended up stacked in the same toolbar wearing the same paint.
   */
  it("no longer calls a period 'all', which is what a status filter is called", () => {
    expect(DATE_PRESETS).not.toContain("all");
    expect(DATE_PRESETS).toContain("any");
  });
});

describe("a range end written on the toolbar", () => {
  /**
   * `new Date("2026-07-12")` is UTC midnight and renders as the 11th in any
   * negative-offset zone. This string is what tells the operator which period
   * the list is showing, so it is parsed field by field instead.
   */
  it("names the day that was picked, not the one before it", () => {
    expect(formatDayShort("2026-07-12", "en")).toContain("12");
    expect(formatDayShort("2026-01-01", "en")).toContain("1");
  });

  it("degrades to a dash rather than 'Invalid Date'", () => {
    expect(formatDayShort("", "en")).toBe("—");
    expect(formatDayShort("not-a-date", "en")).toBe("—");
  });
});
