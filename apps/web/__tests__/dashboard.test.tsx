import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardSnapshot, RevenueReport } from "@/features/dashboard";
import { DashboardPage } from "@/features/dashboard";
import { LocaleProvider } from "@/lib/i18n/provider";

/**
 * The home screen — the one every session lands on first.
 *
 * The figures below are deliberately unlike each other, and every assertion
 * compares digits with the grouping stripped: `formatAmount` groups under
 * `ru-RU`, which separates with a non-breaking space, and asserting on that byte
 * writes a test that fails when ICU is updated rather than when the app breaks.
 */

/** Two days out, so the "expiring" row has a stable countdown to render. */
const inTwoDays = new Date(Date.now() + 2 * 86_400_000).toISOString();

const snapshot = (): DashboardSnapshot => ({
  attention: {
    debtors: [
      {
        id: "mem_2",
        name: "Sardor Yusupov",
        remaining: "75000.00",
        type: "member",
      },
    ],
    expiring: [
      {
        endsAt: inTwoDays,
        id: "msp_1",
        memberId: "mem_1",
        name: "Dilnoza Karimova",
        phone: "998901234567",
        plan: "Oylik",
        remainingVisits: null,
        state: "expiring",
      },
    ],
    lowStock: [
      {
        id: "prd_1",
        name: "Suv 0.5",
        status: "low",
        stock: "3.00",
        unit: "dona",
      },
    ],
  },
  cashboxes: { card: "260000.00", cash: "480000.00", transfer: "130000.00" },
  members: {
    active: 90,
    expiring: 6,
    joinedThisMonth: 11,
    lapsed: 32,
    total: 128,
  },
  presence: { members: 12, workers: 3 },
  receivables: {
    membership: "80000.00",
    shop: "20000.00",
    supplier: "47000.00",
  },
  stock: { low: 4, out: 2 },
  today: { expense: "310000.00", orders: 7, revenue: "1250000.00", visits: 42 },
});

/*
 * No two of these, and no total of any of them, repeats another figure anywhere
 * on the screen — otherwise `getByText` finds two matches and fails on the
 * ambiguity rather than on the behaviour under test.
 */
const DAYS = [
  {
    date: "2026-07-29",
    expense: 10_000,
    membership: 210_000,
    other: 0,
    shop: 55_000,
  },
  {
    date: "2026-07-30",
    expense: 20_000,
    membership: 320_000,
    other: 0,
    shop: 105_000,
  },
  {
    date: "2026-07-31",
    expense: 30_000,
    membership: 115_000,
    other: 45_000,
    shop: 95_000,
  },
];

const report = (days: number, quiet: boolean): RevenueReport => ({
  days,
  // A quiet window is not an absent one: the days are still there, they are just
  // all zero, which is what the chart's empty state has to recognise.
  points: DAYS.map((point) =>
    quiet ? { ...point, membership: 0, other: 0, shop: 0 } : point
  ),
  previous: {
    expense: "375000.00",
    membership: "400000.00",
    net: "225000.00",
    other: "20000.00",
    revenue: "600000.00",
    shop: "180000.00",
  },
  topProducts: [
    {
      id: "prd_9",
      name: "Protein shake",
      quantity: "18",
      revenue: "540000.00",
    },
  ],
  totals: {
    expense: "300000.00",
    membership: "600000.00",
    net: "600000.00",
    other: "50000.00",
    revenue: "900000.00",
    shop: "250000.00",
  },
});

/** Matches a rendered figure by its digits, whatever groups them. */
const digits = (expected: string) => (content: string) =>
  content.replace(/\D/g, "") === expected;

let calls: string[] = [];
let quietWindow = false;

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const rootRoute = createRootRoute();

/**
 * A router with the page and the three screens its attention cards link to, and
 * nothing else.
 *
 * `Link` reads the router off context and throws without one, so some router is
 * required — but not the real tree: mounting the authenticated shell in jsdom
 * takes next-themes and the sidebar with it, and the shell is already covered by
 * `layout.test.ts`. The link targets are stubs because what matters here is that
 * a "see all" resolves at all, not what it lands on.
 */
const buildRouter = () =>
  createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({
        getParentRoute: () => rootRoute,
        path: "/",
        component: DashboardPage,
      }),
      ...["/members", "/inventory", "/orders"].map((path) =>
        createRoute({
          getParentRoute: () => rootRoute,
          path,
          component: () => null,
        })
      ),
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });

const renderDashboard = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>
        <RouterProvider router={buildRouter()} />
      </LocaleProvider>
    </QueryClientProvider>
  );
};

/** Both queries have to land before anything is drawn — the page waits for both. */
const waitForLoad = () =>
  waitFor(() => expect(screen.getByText(digits("1250000"))).toBeDefined());

beforeEach(() => {
  calls = [];
  quietWindow = false;

  vi.stubGlobal(
    "fetch",
    vi.fn((input: string, init: RequestInit = {}) => {
      calls.push(`${init.method ?? "GET"} ${input}`);

      // The revenue check comes first: both paths start "/api/dashboard".
      if (input.includes("/dashboard/revenue")) {
        const days = Number(
          new URL(input, "http://test").searchParams.get("days")
        );

        return Promise.resolve(json(report(days, quietWindow)));
      }

      if (input.includes("/dashboard")) {
        return Promise.resolve(json(snapshot()));
      }

      return Promise.resolve(json([]));
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("dashboard", () => {
  it("leads with what the desk has taken since midnight", async () => {
    renderDashboard();

    await waitForLoad();

    expect(screen.getByText(digits("310000"))).toBeDefined();
    expect(screen.getByText(digits("42"))).toBeDefined();
  });

  /**
   * The subtle half of a delta is not the arithmetic, it is the direction. A rise
   * in takings and a rise in spending are the same number and opposite news, and
   * `upIsGood={false}` on the spending tile is the only thing separating them —
   * so a fall in spending has to wear the encouraging colour, not the alarming
   * one.
   */
  it("reads a fall in spending as good news, not a decline", async () => {
    renderDashboard();

    await waitForLoad();

    // +50% on takings (900k against 600k), -20% on spending (300k against 375k).
    expect(screen.getByText("+50%")).toBeDefined();

    const fall = screen.getByText("-20%");

    expect(fall.parentElement?.className).toContain("text-primary-accent");
    expect(fall.parentElement?.className).not.toContain("text-destructive");
  });

  /**
   * Why there are two endpoints rather than one. The window is the revenue
   * query's key, so pressing 7 refetches the trend — and must not re-read the
   * roster, the shelves and the tills, none of which have a date range.
   */
  it("refetches only the trend when the window changes", async () => {
    const user = userEvent.setup();

    renderDashboard();

    await waitForLoad();

    await user.click(screen.getByRole("button", { name: "7 kun" }));

    await waitFor(() =>
      expect(
        calls.some((call) => call.includes("/dashboard/revenue?days=7"))
      ).toBe(true)
    );

    expect(
      calls.filter((call) => call.endsWith("/api/dashboard"))
    ).toHaveLength(1);
  });

  /**
   * The table is not a fallback nobody opens: three of the series colours are
   * legible as a mark but not as text, and the rule for that is that the reader
   * gets a second, contrast-clean way to reach every number.
   */
  it("offers the same numbers as a table", async () => {
    const user = userEvent.setup();

    renderDashboard();

    await waitForLoad();

    await user.click(screen.getByRole("button", { name: "Jadval" }));

    await waitFor(() => expect(screen.getByText("31.07.2026")).toBeDefined());

    // The last day's total: 115k membership + 95k shop + 45k other.
    expect(screen.getByText(digits("255000"))).toBeDefined();
  });

  it("says a quiet window was quiet rather than drawing an empty chart", async () => {
    quietWindow = true;

    renderDashboard();

    await waitForLoad();

    await waitFor(() =>
      expect(screen.getByText("Bu davrda tushum bo'lmagan")).toBeDefined()
    );
  });

  it("lists who to chase, what to reorder, and whose tab is open", async () => {
    renderDashboard();

    await waitForLoad();

    expect(screen.getByText("Dilnoza Karimova")).toBeDefined();
    expect(screen.getByText("Suv 0.5")).toBeDefined();
    expect(screen.getByText("Sardor Yusupov")).toBeDefined();
    expect(screen.getByText(digits("75000"))).toBeDefined();
  });
});
