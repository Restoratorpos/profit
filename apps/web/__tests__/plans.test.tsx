import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanListItem } from "@/features/plans";
import { PlansPage } from "@/features/plans";
import { LocaleProvider } from "@/lib/i18n/provider";

/**
 * The pattern proof for Phase 4.
 *
 * What matters here is not the plans screen specifically — it is that the
 * translation holds: a server component's `backendFetch` became `useQuery`, a
 * server action became `useMutation`, and `revalidatePath("/plans")` became
 * `invalidateQueries`. The eight remaining verticals copy this shape, so if the
 * invalidation is wrong it is wrong nine times.
 */
const plan = (overrides: Partial<PlanListItem> = {}): PlanListItem => ({
  accessFrom: "06:00",
  accessTo: "23:00",
  billingType: "recurring",
  branchId: null,
  description: null,
  duration: 30,
  entryLimit: 0,
  hallId: null,
  hallName: null,
  id: "pln_1",
  isActive: true,
  membershipCount: 0,
  name: "Asosiy a'zolik",
  price: "300000",
  slots: null,
  trainerId: null,
  trainerName: null,
  weekdays: [1, 2, 3, 4, 5],
  ...overrides,
});

const ACTIVE_TOGGLE = /faol/i;
const DELETE_BUTTON = /o'chirish/i;

let plans: PlanListItem[] = [];
let calls: string[] = [];

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>
        <PlansPage />
      </LocaleProvider>
    </QueryClientProvider>
  );
};

beforeEach(() => {
  calls = [];
  plans = [plan()];

  vi.stubGlobal(
    "fetch",
    vi.fn((input: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      calls.push(`${method} ${input}`);

      if (input.endsWith("/plans")) {
        return Promise.resolve(json(plans));
      }

      if (input.endsWith("/halls") || input.endsWith("/trainers")) {
        return Promise.resolve(json([]));
      }

      // A status toggle. Flip the stored row so the refetch observes the change.
      if (input.includes("/status")) {
        plans = plans.map((entry) => ({ ...entry, isActive: !entry.isActive }));
        return Promise.resolve(new Response(null, { status: 204 }));
      }

      return Promise.resolve(new Response(null, { status: 204 }));
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("plans page", () => {
  it("renders the plans returned by the API", async () => {
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("Asosiy a'zolik")).toBeDefined()
    );

    // Money is formatted for the desk, not echoed raw.
    expect(screen.getByText("300,000 UZS")).toBeDefined();
  });

  /**
   * The heart of the port. In Next this worked because the action called
   * `revalidatePath("/plans")`; here it has to be the mutation invalidating the
   * query. If invalidation is missing the button still "works" and the table
   * silently keeps showing the old status — which on a shared desk is two
   * operators disagreeing about whether a plan is sellable.
   */
  it("refetches the list after toggling a plan's status", async () => {
    const user = userEvent.setup();

    renderPage();

    await waitFor(() =>
      expect(screen.getByText("Asosiy a'zolik")).toBeDefined()
    );

    await user.click(screen.getByRole("button", { name: ACTIVE_TOGGLE }));

    await waitFor(() =>
      expect(calls.some((call) => call.includes("/status"))).toBe(true)
    );

    // Two GETs of /plans: the initial load and the invalidation-driven refetch.
    await waitFor(() =>
      expect(calls.filter((call) => call === "GET /api/plans")).toHaveLength(2)
    );
  });

  /**
   * A plan with memberships cannot be deleted. The button stays enabled and
   * explains on tap rather than greying out — there is no hover on a terminal,
   * so a disabled control is a tap that appears to do nothing.
   */
  it("refuses to delete a plan that is in use, and says why", async () => {
    const user = userEvent.setup();
    plans = [plan({ membershipCount: 3 })];

    renderPage();

    await waitFor(() =>
      expect(screen.getByText("Asosiy a'zolik")).toBeDefined()
    );

    await user.click(screen.getByRole("button", { name: DELETE_BUTTON }));

    expect(screen.getByRole("alert")).toBeDefined();
    expect(calls.some((call) => call.startsWith("DELETE"))).toBe(false);
  });
});
