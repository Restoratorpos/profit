import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALES } from "@/lib/i18n/config";
import { getMessages, type MessageKey } from "@/lib/i18n/dictionary";

/**
 * The orders toolbar, asserted against its own source.
 *
 * Every failure guarded here is a paint or a string: nothing typechecks, lints
 * or builds any differently when it comes back, which is exactly why the two
 * "Barchasi" buttons survived a migration and a design pass. Same approach as
 * `selected-state.test.ts` and `layout.test.ts`.
 */

const src = (...parts: string[]) =>
  readFileSync(join(process.cwd(), "src", ...parts), "utf8");

const ordersView = src("features", "orders", "components", "orders-view.tsx");
const tablePagination = src("components", "table-pagination.tsx");

/** A control that announces a selected state, whatever the condition is named. */
const ANNOUNCES_SELECTION = /aria-(checked|pressed)=/;
/** The paint reserved for actions, applied conditionally — i.e. to a selection. */
const PAINTED_AS_ACTION = /\?\s*"default"/;
const RADIO_GROUP = /role="radiogroup"/g;
const LABELLED_WITH_PAGE_TITLE = /aria-label=\{messages\["nav\.orders"\]\}/;

describe("the words on the orders toolbar", () => {
  /**
   * THE bug the user reported. `orders.filterAll` and `orders.rangeAll` were
   * both literally "Barchasi", rendered one directly above the other in the same
   * green — one meaning "all statuses", the other "all time".
   *
   * Scoped to filter-versus-range rather than "no two orders.* keys collide",
   * because `orders.filterPaid` and `orders.paidBadge` are both legitimately
   * "To'langan" and always will be.
   */
  it("never gives a status filter and a period the same label", () => {
    for (const { code } of LOCALES) {
      const locale = code;
      const messages = getMessages(locale);
      const keys = Object.keys(messages) as MessageKey[];

      const filters = keys.filter((key) => key.startsWith("orders.filter"));
      const ranges = keys.filter((key) => key.startsWith("orders.range"));

      for (const filter of filters) {
        for (const range of ranges) {
          expect(
            messages[filter].toLowerCase(),
            `${locale}: ${filter} and ${range} both read "${messages[filter]}"`
          ).not.toBe(messages[range].toLowerCase());
        }
      }
    }
  });

  /**
   * The key was deleted rather than reworded, so that reaching for it is a
   * compile error. This fails first and says why.
   */
  it("has no orders.rangeAll left to reach for", () => {
    expect(JSON.stringify(getMessages("uz"))).not.toContain("orders.rangeAll");
    expect(ordersView).not.toContain("orders.rangeAll");
  });
});

describe("what solid green means on the orders screen", () => {
  /**
   * Solid `variant="default"` is `bg-primary` — the same paint as "+ Yangi
   * buyurtma" and every row's "To'lash". Five of them on one screen left the eye
   * no way to find the one that did something. A chosen control wears
   * SELECTED_TINT; solid stays reserved for actions.
   *
   * Keyed on the ARIA rather than on the variable name in the ternary. A control
   * that announces itself as checked or pressed IS a selection, whatever the
   * condition is called — which catches both the old `active ? "default"` and
   * the page sizes' `pageSize === size ? "default"`, while leaving the row's
   * genuinely-an-action Pay button alone. A name-based pattern would either miss
   * one of those or forbid the other.
   */
  const selectionsIn = (source: string) =>
    source.split("<Button").filter((block) => ANNOUNCES_SELECTION.test(block));

  it("never paints a selected control as an action", () => {
    const selections = [
      ...selectionsIn(ordersView),
      ...selectionsIn(tablePagination),
    ];

    // Guards the guard: if the split stops finding them, this proves nothing.
    expect(selections.length).toBeGreaterThanOrEqual(4);

    for (const block of selections) {
      expect(block).not.toMatch(PAINTED_AS_ACTION);
    }
  });

  it("tints the chosen control instead", () => {
    expect(ordersView).toContain("SELECTED_TINT");
    expect(tablePagination).toContain("SELECTED_TINT");
  });
});

describe("how the toolbar is announced", () => {
  /**
   * Three groups: status, the presets inside the range popover, and the page
   * sizes. The page sizes carried `role="radio"` with no group ancestor at all —
   * invalid ARIA, announced as three loose radios belonging to nothing.
   */
  it("puts every radio inside a group", () => {
    const groups = ordersView.match(RADIO_GROUP) ?? [];

    expect(groups).toHaveLength(3);
  });

  /**
   * The status group was labelled with the page title ("Buyurtmalar"), and the
   * preset group with `orders.rangeAll` — the collision spoken aloud, with no
   * visual cue to compensate.
   */
  it("labels each group with the question it asks", () => {
    expect(ordersView).toContain('messages["orders.filterLabel"]');
    expect(ordersView).toContain('messages["orders.rangeLabel"]');
    expect(ordersView).not.toMatch(LABELLED_WITH_PAGE_TITLE);
  });
});
