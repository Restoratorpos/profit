import { describe, expect, it } from "vitest";
import { isNavItemActive, NAV_ITEMS } from "@/lib/navigation";

/**
 * Which sidebar row lights up. Worth testing because two rows can cover the
 * same route — `/orders` and `/orders/new` — and only the more specific one is
 * where the operator actually is.
 */

/** Every row the sidebar would light up for this route. */
const activeFor = (pathname: string): string[] =>
  NAV_ITEMS.filter((item) => isNavItemActive(item.href, pathname)).map(
    (item) => item.href
  );

describe("isNavItemActive", () => {
  it("lights exactly one row per route", () => {
    for (const pathname of [
      "/",
      "/orders",
      "/orders/new",
      "/members",
      "/members/abc",
      "/transactions",
    ]) {
      expect(activeFor(pathname)).toHaveLength(1);
    }
  });

  it("gives a nested route to the more specific row", () => {
    expect(activeFor("/orders/new")).toEqual(["/orders/new"]);
  });

  it("keeps a child route on its parent when nothing is more specific", () => {
    expect(activeFor("/members/abc")).toEqual(["/members"]);
    expect(activeFor("/inventory/suppliers")).toEqual(["/inventory"]);
  });

  it("never lights the dashboard on anything but itself", () => {
    expect(isNavItemActive("/", "/")).toBe(true);
    expect(isNavItemActive("/", "/orders")).toBe(false);
  });

  it("does not match a route that merely starts with the same letters", () => {
    expect(isNavItemActive("/orders", "/orders-archive")).toBe(false);
  });

  /**
   * The catalog tabs live on the page, so every route in that section keeps the
   * one Mahsulotlar row lit — the sidebar does not grow a second answer to a
   * question the page is already asking.
   */
  it("keeps Products lit anywhere inside its section", () => {
    expect(activeFor("/products/combos")).toEqual(["/products"]);
    expect(activeFor("/products/ingredients")).toEqual(["/products"]);
    expect(activeFor("/products/combos/new")).toEqual(["/products"]);
  });
});
