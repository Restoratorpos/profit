import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The door rules. `evaluateMemberAccess` is the one function here that decides
 * whether a real person standing at a terminal gets in, so it is tested against
 * the database layer stubbed out rather than mocked away wholesale — the shape
 * of the rows is part of what is being asserted.
 */
const rows = vi.hoisted(() => ({ value: [] as unknown[] }));

vi.mock("../src/db/index.js", () => {
  // A chainable stub: every builder method returns itself, and awaiting the
  // chain yields whatever the test parked in `rows`.
  const chain: Record<string, unknown> = {};
  const methods = [
    "select",
    "from",
    "leftJoin",
    "where",
    "orderBy",
    "limit",
    "groupBy",
    "offset",
  ];

  for (const method of methods) {
    chain[method] = () => chain;
  }

  /*
   * A drizzle query builder *is* a thenable — awaiting the chain is how a query
   * runs — so the stub has to be one too. The key comes from a variable because
   * a literal `then` is linted against everywhere else in this repo, and that
   * rule is right everywhere except here.
   */
  const thenable = "then";

  Object.defineProperty(chain, thenable, {
    value: (resolve: (value: unknown) => unknown) => resolve(rows.value),
  });

  return { db: chain };
});

const { evaluateMemberAccess } = await import(
  "../src/services/attendance.service.js"
);

const GYM = "gym_00000000000000001";
const MEMBER = "mem_0000000000000001";

/** A membership row as the access query returns it. */
const membership = (overrides: Record<string, unknown> = {}) => ({
  accessFrom: null,
  accessTo: null,
  endsAt: null,
  membershipId: "mbs_1",
  planName: "Asosiy",
  remainingVisits: null,
  startsAt: null,
  weekdays: null,
  ...overrides,
});

/** A local time on a Sunday (ISO weekday 7). */
const at = (hour: number, minute = 0) => new Date(2026, 6, 26, hour, minute, 0);

beforeEach(() => {
  rows.value = [];
});

describe("evaluateMemberAccess", () => {
  it("lets a plan with no window in at any hour", async () => {
    rows.value = [membership()];

    const decision = await evaluateMemberAccess(GYM, MEMBER, at(3));

    expect(decision.isAllowed).toBe(true);
    expect(decision.membershipId).toBe("mbs_1");
  });

  it("treats an unset weekday list as every day, not as no days", async () => {
    // Plans are created with `weekdays: []` by default, so reading empty as a
    // closed door would lock out every gym that never configured one.
    rows.value = [membership({ weekdays: "" })];

    expect((await evaluateMemberAccess(GYM, MEMBER, at(9))).isAllowed).toBe(
      true
    );
  });

  it("allows an entry inside the plan's window", async () => {
    rows.value = [
      membership({
        accessFrom: new Date(2026, 0, 1, 6, 0),
        accessTo: new Date(2026, 0, 1, 12, 0),
      }),
    ];

    expect((await evaluateMemberAccess(GYM, MEMBER, at(9))).isAllowed).toBe(
      true
    );
  });

  it("refuses an entry before the window opens, and says which", async () => {
    rows.value = [
      membership({
        accessFrom: new Date(2026, 0, 1, 6, 0),
        accessTo: new Date(2026, 0, 1, 12, 0),
      }),
    ];

    const decision = await evaluateMemberAccess(GYM, MEMBER, at(5, 59));

    expect(decision.isAllowed).toBe(false);
    expect(decision.reason).toBe("outside_hours");
    // The window comes back with the refusal so the desk can see the near miss.
    expect(decision.accessFrom).toBe("06:00");
    expect(decision.accessTo).toBe("12:00");
  });

  it("refuses after the window closes", async () => {
    rows.value = [
      membership({
        accessFrom: new Date(2026, 0, 1, 6, 0),
        accessTo: new Date(2026, 0, 1, 12, 0),
      }),
    ];

    expect((await evaluateMemberAccess(GYM, MEMBER, at(12, 1))).reason).toBe(
      "outside_hours"
    );
  });

  it("handles a window that runs over midnight as one night", async () => {
    rows.value = [
      membership({
        accessFrom: new Date(2026, 0, 1, 22, 0),
        accessTo: new Date(2026, 0, 1, 6, 0),
      }),
    ];

    expect((await evaluateMemberAccess(GYM, MEMBER, at(23))).isAllowed).toBe(
      true
    );
    expect((await evaluateMemberAccess(GYM, MEMBER, at(2))).isAllowed).toBe(
      true
    );
    expect((await evaluateMemberAccess(GYM, MEMBER, at(12))).isAllowed).toBe(
      false
    );
  });

  it("refuses a day the plan does not run", async () => {
    // 26 July 2026 is a Sunday, ISO weekday 7.
    rows.value = [membership({ weekdays: "1,2,3,4,5" })];

    expect((await evaluateMemberAccess(GYM, MEMBER, at(9))).reason).toBe(
      "wrong_weekday"
    );
  });

  it("allows the weekday the scan actually falls on", async () => {
    rows.value = [membership({ weekdays: "6,7" })];

    expect((await evaluateMemberAccess(GYM, MEMBER, at(9))).isAllowed).toBe(
      true
    );
  });

  it("refuses an exhausted visit pass", async () => {
    rows.value = [membership({ remainingVisits: 0 })];

    expect((await evaluateMemberAccess(GYM, MEMBER, at(9))).reason).toBe(
      "no_visits"
    );
  });

  it("lets a visit pass with visits left through", async () => {
    rows.value = [membership({ remainingVisits: 3 })];

    expect((await evaluateMemberAccess(GYM, MEMBER, at(9))).isAllowed).toBe(
      true
    );
  });

  it("refuses a membership whose end date has passed", async () => {
    rows.value = [membership({ endsAt: new Date(2026, 5, 1) })];

    expect((await evaluateMemberAccess(GYM, MEMBER, at(9))).reason).toBe(
      "expired"
    );
  });

  it("reports no membership when the member holds none", async () => {
    rows.value = [];

    const decision = await evaluateMemberAccess(GYM, MEMBER, at(9));

    expect(decision.isAllowed).toBe(false);
    expect(decision.reason).toBe("no_membership");
    expect(decision.membershipId).toBeNull();
  });

  it("lets a second membership open the door the first one closed", async () => {
    rows.value = [
      membership({
        accessFrom: new Date(2026, 0, 1, 6, 0),
        accessTo: new Date(2026, 0, 1, 9, 0),
        membershipId: "morning",
      }),
      membership({
        accessFrom: new Date(2026, 0, 1, 17, 0),
        accessTo: new Date(2026, 0, 1, 22, 0),
        membershipId: "evening",
      }),
    ];

    const decision = await evaluateMemberAccess(GYM, MEMBER, at(18));

    expect(decision.isAllowed).toBe(true);
    // And it charges the one that actually let them in.
    expect(decision.membershipId).toBe("evening");
  });

  it("reports the wavable reason when memberships fail for different ones", async () => {
    // "Outside hours" is the case a human at the desk can wave through, so it
    // must win over an expired card they cannot.
    rows.value = [
      membership({ endsAt: new Date(2026, 5, 1), membershipId: "old" }),
      membership({
        accessFrom: new Date(2026, 0, 1, 6, 0),
        accessTo: new Date(2026, 0, 1, 9, 0),
        membershipId: "morning",
      }),
    ];

    expect((await evaluateMemberAccess(GYM, MEMBER, at(18))).reason).toBe(
      "outside_hours"
    );
  });
});
