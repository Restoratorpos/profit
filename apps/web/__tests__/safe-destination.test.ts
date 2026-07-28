import { describe, expect, it } from "vitest";
import { safeDestination } from "@/lib/auth/safe-destination";

/**
 * `?redirect=` is attacker-controlled: the whole point of the parameter is that
 * a stranger can put a value in it and send someone the link. Everything here is
 * an open-redirect attempt.
 */
describe("safeDestination", () => {
  it("keeps an ordinary in-app path", () => {
    expect(safeDestination("/members")).toBe("/members");
    expect(safeDestination("/orders/new")).toBe("/orders/new");
    expect(safeDestination("/members?filter=active")).toBe(
      "/members?filter=active"
    );
  });

  it("falls back to the dashboard when there is nothing to follow", () => {
    expect(safeDestination(undefined)).toBe("/");
    expect(safeDestination("")).toBe("/");
  });

  it("refuses an absolute URL to another origin", () => {
    expect(safeDestination("https://evil.com")).toBe("/");
    expect(safeDestination("http://evil.com/steal")).toBe("/");
  });

  /**
   * The one that looks safe. It starts with a slash, so a naive
   * `startsWith("/")` check passes it — and the browser reads `//evil.com` as
   * protocol-relative and leaves the origin.
   */
  it("refuses a protocol-relative URL", () => {
    expect(safeDestination("//evil.com")).toBe("/");
    expect(safeDestination("//evil.com/path")).toBe("/");
  });

  it("refuses a backslash-smuggled protocol-relative URL", () => {
    // Browsers normalise the backslash to a slash, so this escapes too.
    expect(safeDestination("/\\evil.com")).toBe("/");
  });

  it("refuses a javascript: payload", () => {
    expect(safeDestination("javascript:alert(1)")).toBe("/");
  });
});
