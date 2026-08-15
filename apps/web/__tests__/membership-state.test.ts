import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards the rule that a member's memberships are not folded into one.
 *
 * A member can hold a gym plan, a spa pass and a sauna package at once, and
 * those run on different clocks. The list used to reduce them to a single end
 * date and a single visit count, and both summaries lied in the same direction:
 * they hid the membership that was about to lapse behind the one that was not.
 *
 * Asserted against the source because the failure is arithmetic on real data —
 * it typechecks, it renders, and it is only wrong for members who hold more
 * than one thing.
 */

const service = readFileSync(
  join(
    import.meta.dirname,
    "../../../apps/backend/src/services/member.service.ts"
  ),
  "utf8"
);

describe("the members list", () => {
  it("keeps each membership whole instead of summing them", () => {
    // `held.push({...})` per row, not a running total.
    expect(service).toContain("current.held.push({");
  });

  it("no longer sums visits across memberships", () => {
    /*
     * Ten gym entries plus five sauna entries used to read as "15", but a sauna
     * entry will not get you into the gym. The number described neither
     * membership and fed the expiring filter.
     */
    expect(service).not.toContain("current.remainingVisits =");
  });

  it("reports the soonest expiry, not the furthest", () => {
    /*
     * `later()` is what made a lapsing gym plan invisible behind a year-long
     * sauna package. It is gone, and `nextExpiry` skips already-expired rows so
     * the answer is always "what needs renewing next".
     */
    expect(service).toContain("endsAt: nextExpiry(aggregate.held)");
    expect(service).not.toContain("current.endsAt = later(");
  });

  it("asks each membership whether it is expiring", () => {
    // Not a member-wide summary — one membership running out flags the member.
    expect(service).toContain(
      'member.memberships.some((held) => held.state === "expiring")'
    );
  });

  it("treats a spent visit pass as finished whatever its date says", () => {
    expect(service).toContain(
      "remainingVisits !== null && remainingVisits <= 0"
    );
  });
});

describe("the members table", () => {
  const view = readFileSync(
    join(
      import.meta.dirname,
      "../src/features/members/components/members-view.tsx"
    ),
    "utf8"
  );

  it("draws one badge per membership, keyed by the membership", () => {
    // Keyed by id rather than by plan name: two memberships of the same plan
    // are two badges with two end dates, not one badge with a multiplier.
    expect(view).toContain("key={membership.id}");
    expect(view).toContain("member.memberships.map");
  });

  it("gives each state its own colour", () => {
    expect(view).toContain("STATE_STYLE[membership.state]");
  });

  it("reports sessions for the first membership, never a total", () => {
    /*
     * The sessions column reads `memberships[0]`, which is only the plan the
     * member was signed up on for as long as the list arrives in creation
     * order. Summing is what this column used to do, and a gym entry and a
     * sauna entry are not interchangeable.
     */
    expect(view).toContain("member.memberships[0]?.remainingVisits");
    expect(view).not.toContain("member.remainingVisits");
  });

  it("opens the breakdown from the debt figure as well as the badges", () => {
    // The column says how much is owed and nothing about what for. Both ways in
    // land on the same panel, so there is one place that answers "for what".
    expect(view).toContain("onOpen={() => setViewing(member)}");
    expect(view).toContain("value={member.membershipDebt}");
  });
});

describe("what has been paid on a membership", () => {
  it("is carried per membership, not only summed on the member", () => {
    /*
     * `membershipDebt` is the sum across everything someone holds, and a sum
     * cannot say whether the gym plan is settled and the sauna package untouched
     * or the reverse. Both figures come from the same `income` read the total
     * already did, so this costs no extra query.
     */
    expect(service).toContain("paid: toMoney(paid)");
    expect(service).toContain("price: toMoney(price)");
    expect(service).toContain("debt: toMoney(Math.max(price - paid, 0))");
  });

  it("keeps a comp apart from an unpaid sale", () => {
    /*
     * `memberships.price` holds what was *charged*, so a comp is zero rather
     * than the list price. The panel reads that back: charged nothing means
     * "to'lovsiz", not "0 of 400,000 paid".
     */
    const sheet = readFileSync(
      join(
        import.meta.dirname,
        "../src/features/members/components/membership-detail-sheet.tsx"
      ),
      "utf8"
    );

    expect(sheet).toContain('messages["members.paymentFree"]');
    // And it is a side panel from the right, like every other one in this app.
    expect(sheet).toContain('side="right"');
  });
});

describe("the order memberships arrive in", () => {
  it("is the order they were sold", () => {
    /*
     * Load-bearing, not cosmetic: the sessions column takes index 0 and means
     * it to be the original plan. Ordering by end date instead would put a
     * sauna package bought last week at the top the moment it outlasts the gym
     * plan, and the column would silently start reporting the wrong thing.
     */
    expect(service).toContain(
      "asc(memberships.createdAt), asc(memberships.membershipId)"
    );
    expect(service).toContain("memberships: aggregate.held,");
  });
});
