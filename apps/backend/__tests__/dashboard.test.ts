import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  MemberListItem,
  MemberMembershipView,
  MembershipState,
} from "../src/services/member.service.js";

/**
 * Two halves, the same split the transactions suite uses.
 *
 * The HTTP surface is driven against a mocked service — tenant scoping, the
 * range bound, status codes — and the arithmetic underneath is tested for real,
 * because the two things this screen can quietly get wrong are the shape of the
 * day spine (a chart that closes its own gaps) and the member partition (a tile
 * that reports the gym smaller than it is the week before every renewal).
 */
const service = vi.hoisted(() => ({
  getDashboardSnapshot: vi.fn(),
  getRevenueReport: vi.fn(),
}));

vi.mock("../src/services/dashboard.service.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../src/services/dashboard.service.js")
    >();

  // The pure helpers stay real; only the db-touching entry points are stubbed.
  return { ...actual, ...service };
});

const { app } = await import("../src/app.js");
const { revenueSourceOf, revenueSpine, summariseRevenue, summariseStanding } =
  await import("../src/services/dashboard.service.js");

const TOKEN = "test-service-token-at-least-16";
const GYM = "gym_00000000000000001";
const WORKER = "wrk_0000000000000001";

const request = (path: string) =>
  app.request(path, {
    headers: {
      "x-gym-id": GYM,
      "x-service-token": TOKEN,
      "x-worker-id": WORKER,
    },
  });

beforeEach(() => {
  for (const fn of Object.values(service)) {
    fn.mockReset();
  }

  service.getDashboardSnapshot.mockResolvedValue({});
  service.getRevenueReport.mockResolvedValue({});
});

describe("dashboard auth", () => {
  it("rejects a request with no credentials at all", async () => {
    const response = await app.request("/dashboard");

    expect(response.status).toBe(401);
    expect(service.getDashboardSnapshot).not.toHaveBeenCalled();
  });

  it("rejects a valid service token with no gym header", async () => {
    const response = await app.request("/dashboard", {
      headers: { "x-service-token": TOKEN },
    });

    expect(response.status).toBe(401);
  });
});

describe("GET /dashboard/revenue", () => {
  it("passes the caller's gym, never one from the query string", async () => {
    const response = await request("/dashboard/revenue?days=7");

    expect(response.status).toBe(200);
    expect(service.getRevenueReport).toHaveBeenCalledWith(GYM, { days: 7 });
  });

  it("defaults the window rather than reading all of history", async () => {
    await request("/dashboard/revenue");

    expect(service.getRevenueReport).toHaveBeenCalledWith(GYM, { days: 30 });
  });

  it("refuses a window wider than a year", async () => {
    const response = await request("/dashboard/revenue?days=100000");

    expect(response.status).toBe(400);
    expect(service.getRevenueReport).not.toHaveBeenCalled();
  });

  it("refuses a window of no days", async () => {
    const response = await request("/dashboard/revenue?days=0");

    expect(response.status).toBe(400);
  });
});

describe("revenueSourceOf", () => {
  it("splits the two sales channels the gym actually runs", () => {
    expect(revenueSourceOf("membership")).toBe("membership");
    expect(revenueSourceOf("order")).toBe("shop");
  });

  it("banks anything else, including an uncategorised legacy row", () => {
    expect(revenueSourceOf("hall_rent")).toBe("other");
    expect(revenueSourceOf(null)).toBe("other");
  });
});

describe("revenueSpine", () => {
  it("emits one point per local day, upper bound exclusive", () => {
    const points = revenueSpine(new Date(2026, 6, 27), new Date(2026, 6, 30));

    expect(points.map((point) => point.date)).toEqual([
      "2026-07-27",
      "2026-07-28",
      "2026-07-29",
    ]);
  });

  it("crosses a month boundary without repeating or skipping a day", () => {
    const points = revenueSpine(new Date(2026, 6, 30), new Date(2026, 7, 2));

    expect(points.map((point) => point.date)).toEqual([
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
    ]);
  });

  /*
   * The whole reason the spine exists. A chart built only from the days that
   * carry rows closes its own gaps: a week with two quiet days would render as
   * five columns and read as continuous trading.
   */
  it("fills quiet days with zero rather than leaving them out", () => {
    const points = revenueSpine(new Date(2026, 6, 27), new Date(2026, 6, 30));

    expect(points).toHaveLength(3);
    for (const point of points) {
      expect(point.membership).toBe(0);
      expect(point.shop).toBe(0);
      expect(point.other).toBe(0);
      expect(point.expense).toBe(0);
    }
  });

  it("returns nothing when the window is empty", () => {
    const day = new Date(2026, 6, 27);

    expect(revenueSpine(day, day)).toEqual([]);
  });

  it("ignores the time of day on either bound", () => {
    const points = revenueSpine(
      new Date(2026, 6, 27, 23, 59),
      new Date(2026, 6, 29, 0, 1)
    );

    expect(points.map((point) => point.date)).toEqual([
      "2026-07-27",
      "2026-07-28",
      "2026-07-29",
    ]);
  });
});

describe("summariseRevenue", () => {
  const point = (
    date: string,
    membership: number,
    shop: number,
    other: number,
    expense: number
  ) => ({ date, expense, membership, other, shop });

  it("adds the three sources into one revenue figure", () => {
    const totals = summariseRevenue([
      point("2026-07-27", 100, 20, 5, 0),
      point("2026-07-28", 50, 10, 0, 0),
    ]);

    expect(totals.membership).toBe("150.00");
    expect(totals.shop).toBe("30.00");
    expect(totals.other).toBe("5.00");
    expect(totals.revenue).toBe("185.00");
  });

  it("reports a loss as a negative net rather than flooring it", () => {
    const totals = summariseRevenue([point("2026-07-27", 100, 0, 0, 250)]);

    expect(totals.net).toBe("-150.00");
  });

  it("answers zeros for an empty window", () => {
    const totals = summariseRevenue([]);

    expect(totals.revenue).toBe("0.00");
    expect(totals.expense).toBe("0.00");
    expect(totals.net).toBe("0.00");
  });
});

const membership = (
  state: MembershipState,
  overrides: Partial<MemberMembershipView> = {}
): MemberMembershipView => ({
  debt: "0.00",
  discount: null,
  endsAt: "2026-08-05T00:00:00.000Z",
  id: `mem_${state}`,
  name: "Gym",
  paid: "0.00",
  planId: "pln_1",
  price: "0.00",
  remainingVisits: null,
  startsAt: null,
  state,
  totalVisits: null,
  ...overrides,
});

const member = (
  id: string,
  held: MemberMembershipView[],
  isActive = true
): MemberListItem => ({
  birthdate: null,
  branchId: null,
  endsAt: null,
  gender: null,
  hasFace: false,
  id,
  isActive,
  membershipDebt: "0.00",
  memberships: held,
  name: id,
  phone: null,
  shopDebt: "0.00",
  startsAt: null,
  uniqueId: null,
});

describe("summariseStanding", () => {
  it("counts a member once however many memberships they hold", () => {
    const standing = summariseStanding([
      member("a", [membership("active"), membership("active")]),
    ]);

    expect(standing.active).toBe(1);
    expect(standing.total).toBe(1);
  });

  /*
   * The property the tile depends on: a membership running out on Friday is
   * still a membership. Counting `expiring` as a fourth bucket beside `active`
   * would report the gym shrinking every week before a renewal round.
   */
  it("counts an expiring member as active as well as expiring", () => {
    const standing = summariseStanding([member("a", [membership("expiring")])]);

    expect(standing.active).toBe(1);
    expect(standing.expiring).toBe(1);
  });

  it("keeps a member active when one plan lapsed and another has not", () => {
    const standing = summariseStanding([
      member("a", [membership("expired"), membership("active")]),
    ]);

    expect(standing.active).toBe(1);
    expect(standing.expiring).toBe(0);
    expect(standing.lapsed).toBe(0);
  });

  it("counts somebody holding nothing but expired plans as lapsed", () => {
    const standing = summariseStanding([member("a", [membership("expired")])]);

    expect(standing.active).toBe(0);
    expect(standing.lapsed).toBe(1);
  });

  it("counts a member who never bought anything as lapsed", () => {
    const standing = summariseStanding([member("a", [])]);

    expect(standing.lapsed).toBe(1);
  });

  /*
   * A deactivated member is off the roster, not a renewal to chase — but they
   * are still on the books, so `total` keeps them and `lapsed` absorbs them.
   */
  it("never counts a deactivated member as active or expiring", () => {
    const standing = summariseStanding([
      member("a", [membership("expiring")], false),
    ]);

    expect(standing.active).toBe(0);
    expect(standing.expiring).toBe(0);
    expect(standing.total).toBe(1);
    expect(standing.lapsed).toBe(1);
  });

  it("partitions the roster: active plus lapsed is everybody", () => {
    const standing = summariseStanding([
      member("a", [membership("active")]),
      member("b", [membership("expiring")]),
      member("c", [membership("expired")]),
      member("d", []),
      member("e", [membership("active")], false),
    ]);

    expect(standing.active + standing.lapsed).toBe(standing.total);
    expect(standing.total).toBe(5);
    expect(standing.active).toBe(2);
    expect(standing.expiring).toBe(1);
  });
});
