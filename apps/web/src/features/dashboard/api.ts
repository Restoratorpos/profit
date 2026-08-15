import { queryOptions, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import {
  type DashboardSnapshot,
  DEFAULT_REVENUE_RANGE,
  type RevenueRange,
  type RevenueReport,
} from "./types";

export const dashboardKeys = {
  all: ["dashboard"] as const,
  revenue: (days: RevenueRange) =>
    [...dashboardKeys.all, "revenue", days] as const,
  snapshot: () => [...dashboardKeys.all, "snapshot"] as const,
};

/**
 * What is true now: who is in the building, what each till holds, who to chase.
 *
 * Read-only, and nothing on this screen writes — so there are no mutation hooks
 * here and no invalidation to arrange. It goes stale the way every other screen
 * does, through the shared query client's refetch policy.
 */
export const snapshotQuery = queryOptions({
  queryKey: dashboardKeys.snapshot(),
  queryFn: () => apiFetch<DashboardSnapshot>("/dashboard"),
});

/**
 * The trend, keyed by its window.
 *
 * The window is in the key rather than a parameter the caller re-applies, so
 * switching from a week to a month is the refetch — and switching back is free,
 * because the week is still in the cache.
 */
export const revenueQuery = (days: RevenueRange) =>
  queryOptions({
    queryKey: dashboardKeys.revenue(days),
    queryFn: () => apiFetch<RevenueReport>(`/dashboard/revenue?days=${days}`),
    /*
     * The chart holds its previous render while the next window loads. Without
     * this the card empties to a spinner and the page jumps by the chart's whole
     * height every time somebody presses 7 / 30 / 90.
     */
    placeholderData: (previous) => previous,
  });

export const useSnapshot = () => useQuery(snapshotQuery);

export const useRevenue = (days: RevenueRange = DEFAULT_REVENUE_RANGE) =>
  useQuery(revenueQuery(days));
