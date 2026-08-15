import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatDay,
  formatDuration,
  formatMonth,
  formatStamp,
  formatTime,
  toDate,
} from "@/lib/date";

/**
 * How a date reads at the desk.
 *
 * This exists because `Intl.DateTimeFormat("uz-UZ")` has no Uzbek month names:
 * it rendered 3 August 2026 as **"2026 M08 3"**, year first, month as a code.
 * Every screen that showed a date showed that. The other half of the same bug
 * was a hard-coded `"en-GB"` in four files, printing English months into an
 * Uzbek UI.
 *
 * So the months are a table in `lib/date.ts` and these assert the shape they
 * come out in. They fail only by looking wrong, which is the only way this can
 * break — nothing here stops compiling.
 */

describe("the day and month", () => {
  const august3 = "2026-08-03T08:12:00";

  it("names the month in words, day first", () => {
    expect(formatDate(august3, "uz")).toBe("3 avgust, 2026");
    expect(formatDate(august3, "ru")).toBe("3 августа, 2026");
    expect(formatDate(august3, "en")).toBe("3 August, 2026");
  });

  it("carries the clock alongside the date where a row shows both", () => {
    // The debts list, which is where "2026 M08 3 08:12" was first seen.
    expect(formatDateTime(august3, "uz")).toBe("3 avgust, 2026 08:12");
  });

  it("never renders a month as a code", () => {
    for (const locale of ["uz", "ru", "en"] as const) {
      expect(formatDate(august3, locale)).not.toContain("M08");
    }
  });

  it("drops the year where the row is a log, not a record", () => {
    expect(formatStamp(august3, "uz")).toBe("3 avgust, 08:12");
    expect(formatDay(august3, "uz")).toBe("3 avgust");
  });

  it("keeps the clock 24-hour — this is a counter, not a phone", () => {
    expect(formatTime("2026-08-03T18:03:00")).toBe("18:03");
  });

  it("names a period from its bare 'YYYY-MM' form", () => {
    // Nominative in Russian: a month naming itself, not a day inside it.
    expect(formatMonth("2026-08", "uz")).toBe("avgust 2026");
    expect(formatMonth("2026-08", "ru")).toBe("август 2026");
  });
});

describe("how long a shift ran", () => {
  it("names the units in the reader's language", () => {
    // The staff panel showed "65h 30m" in an Uzbek UI — English, in the one
    // figure that panel exists to show.
    expect(formatDuration(3930, "uz")).toBe("65 soat 30 daq");
    expect(formatDuration(3930, "ru")).toBe("65 ч 30 мин");
    expect(formatDuration(3930, "en")).toBe("65h 30m");
  });

  it("drops a part that would read as zero", () => {
    expect(formatDuration(180, "uz")).toBe("3 soat");
    expect(formatDuration(45, "uz")).toBe("45 daq");
    expect(formatDuration(0, "uz")).toBe("0 daq");
  });
});

describe("dates that are not dates", () => {
  it("shows a dash rather than 'Invalid Date'", () => {
    expect(formatDate(null, "uz")).toBe("—");
    expect(formatDate("", "uz")).toBe("—");
    expect(formatDate("not-a-date", "uz")).toBe("—");
  });

  /*
   * A bare "2026-08-03" is UTC midnight per the spec, and `new Date(value)`
   * renders it as the 2nd anywhere west of Greenwich. The desk filter passes
   * exactly this shape, so it is read field by field instead.
   */
  it("names the day that was written, not the one before it", () => {
    const parsed = toDate("2026-08-03");

    expect(parsed?.getDate()).toBe(3);
    expect(formatDay("2026-08-03", "uz")).toBe("3 avgust");
  });
});
