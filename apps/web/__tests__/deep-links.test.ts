import { describe, expect, it } from "vitest";
import { DEFAULT_STOCK_SEED, stockSeedFrom } from "@/features/inventory/types";
import {
  DEFAULT_MEMBER_QUERY,
  memberQueryFrom,
} from "@/features/members/types";
import { DEFAULT_ORDER_SEED, orderSeedFrom } from "@/features/orders/types";
import { searchText } from "@/lib/search-text";

/**
 * The dashboard's attention lists link into the roster, the shelves and the
 * unpaid tabs, and those links are meant to survive being bookmarked and
 * pasted. What that costs is covered here: a URL that says nothing has to mean
 * the screen's own default, and a URL that says something odd has to mean the
 * default too rather than an error page.
 */

describe("a search term in the URL", () => {
  it("keeps an ordinary term as typed", () => {
    expect(searchText.parse("Dilnoza")).toBe("Dilnoza");
  });

  /**
   * The one that bites. The router JSON-encodes search values, so the link the
   * dashboard writes for a phone is `q="998901234567"` — and the moment anybody
   * trims those quotes, the parser hands zod a *number*. A plain `z.string()`
   * rejects it and the screen opens unfiltered with nothing to say why, which
   * is the worst of the three possible outcomes.
   */
  it("reads a phone number left unquoted as its digits", () => {
    expect(searchText.parse(998_901_234_567)).toBe("998901234567");
  });

  it("means no term at all when it is absent", () => {
    expect(searchText.parse(undefined)).toBeUndefined();
  });

  /** A hand-mangled link opens the plain screen; it never throws. */
  it("falls back to no term when it is nonsense", () => {
    expect(searchText.parse({ not: "a term" })).toBeUndefined();
  });
});

describe("a screen opened without search params", () => {
  it("gives the roster exactly what it opens on by itself", () => {
    expect(memberQueryFrom({})).toEqual(DEFAULT_MEMBER_QUERY);
  });

  it("gives the shelves and the tabs their own defaults", () => {
    expect(stockSeedFrom({})).toEqual(DEFAULT_STOCK_SEED);
    expect(orderSeedFrom({})).toEqual(DEFAULT_ORDER_SEED);
  });
});

describe("a screen opened from the dashboard", () => {
  it("narrows the roster to the card that linked to it", () => {
    const query = memberQueryFrom({ filter: "expiring", q: "998901234567" });

    expect(query.filter).toBe("expiring");
    expect(query.query).toBe("998901234567");
    // Paging is never carried across: a link that lands on somebody else's page
    // four breaks the moment a member is added.
    expect(query.page).toBe(DEFAULT_MEMBER_QUERY.page);
  });

  /**
   * The low-stock card mixes "kam qoldi" with "tugagan" and the stock screen
   * filters by one status at a time, so it sorts instead — ascending stock puts
   * the same rows on top without hiding the other half.
   */
  it("sorts the shelves rather than filtering half of them away", () => {
    const seed = stockSeedFrom({ sort: "stock" });

    expect(seed.sort).toBe("stock");
    expect(seed.status).toBe("total");
  });

  it("opens the tabs on the unpaid list", () => {
    expect(orderSeedFrom({ filter: "unpaid", q: "Sardor" })).toEqual({
      filter: "unpaid",
      q: "Sardor",
    });
  });
});
