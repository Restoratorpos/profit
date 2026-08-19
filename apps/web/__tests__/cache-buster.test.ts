import { describe, expect, it } from "vitest";
import { CACHE_SCHEMA_VERSION, cacheBuster } from "@/lib/query-client";

/**
 * The persisted query cache is restored and painted *before* anything
 * refetches. That makes the buster the only thing standing between a stored
 * cache and the components that read it, and it has two separate jobs.
 *
 * This suite exists because the second job was missing and cost a white screen:
 * adding `activity` to the revenue report meant every dashboard whose cache
 * predated it crashed on `report.activity.visits`, with the API answering
 * perfectly the whole time.
 */

describe("the persisted cache buster", () => {
  /**
   * A front desk is a shared machine. Restoring the previous operator's cached
   * roster for the next one is a data leak, not a slow screen.
   */
  it("refuses one operator's cache to another", () => {
    expect(cacheBuster("worker_1")).not.toBe(cacheBuster("worker_2"));
  });

  it("treats a signed-out terminal as its own owner", () => {
    expect(cacheBuster(undefined)).toBe(cacheBuster(null));
    expect(cacheBuster(undefined)).not.toBe(cacheBuster("worker_1"));
  });

  /**
   * The half that was missing. Without the schema version in here, a reload
   * after a deploy feeds last week's JSON to this week's components — so this
   * asserts the version is actually part of the string rather than an exported
   * constant nobody reads.
   */
  it("refuses a cache written under an older wire shape", () => {
    expect(cacheBuster("worker_1")).toContain(CACHE_SCHEMA_VERSION);
    expect(cacheBuster("worker_1")).not.toBe("worker_1");
  });
});
