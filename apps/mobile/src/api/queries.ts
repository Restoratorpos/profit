import { queryOptions } from "@tanstack/react-query";
import type {
  AttendancePage,
  DashboardSnapshot,
  GymSettingsView,
  InventoryItem,
  MemberFilter,
  MemberPage,
  RevenueReport,
  WorkerFilter,
  WorkerPage,
} from "../types";
import { apiFetch, queryString } from "./client";

/**
 * Every read this app makes, in one file.
 *
 * The desk app splits these per feature because it has eleven of them; this app
 * has five screens over the same API, and one file is easier to check against
 * `apps/backend/src/routes/index.ts` than five are.
 *
 * All of it is **read-only**. Nothing here writes, on purpose — see the app's
 * README for why the write flows were deliberately left out of the first cut.
 */

export const keys = {
  dashboard: ["dashboard"] as const,
  revenue: (days: number) => ["dashboard", "revenue", days] as const,
  gym: ["gym"] as const,
  members: (filter: MemberFilter, query: string, page: number) =>
    ["members", filter, query, page] as const,
  workers: (status: WorkerFilter, query: string, page: number) =>
    ["workers", status, query, page] as const,
  inventory: ["inventory"] as const,
  attendance: (from: string, to: string, query: string, page: number) =>
    ["attendance", from, to, query, page] as const,
};

/** How long a figure stays trustworthy before a revisit refetches it. */
const MINUTE = 60_000;

export const dashboardQuery = () =>
  queryOptions({
    queryKey: keys.dashboard,
    queryFn: () => apiFetch<DashboardSnapshot>("/dashboard"),
    staleTime: MINUTE,
  });

export const revenueQuery = (days: number) =>
  queryOptions({
    queryKey: keys.revenue(days),
    queryFn: () =>
      apiFetch<RevenueReport>(`/dashboard/revenue${queryString({ days })}`),
    staleTime: 5 * MINUTE,
  });

export const gymQuery = () =>
  queryOptions({
    queryKey: keys.gym,
    queryFn: () => apiFetch<GymSettingsView>("/gym"),
    /*
     * A gym's name and hours change about never. Holding it for an hour keeps
     * the header filled in on every screen without a request per navigation.
     */
    staleTime: 60 * MINUTE,
  });

export const PAGE_SIZE = 25;

export const membersQuery = (
  filter: MemberFilter,
  query: string,
  page: number
) =>
  queryOptions({
    queryKey: keys.members(filter, query, page),
    queryFn: () =>
      apiFetch<MemberPage>(
        `/members/page${queryString({
          filter,
          page,
          pageSize: PAGE_SIZE,
          query,
        })}`
      ),
    staleTime: MINUTE,
  });

export const workersQuery = (
  status: WorkerFilter,
  query: string,
  page: number
) =>
  queryOptions({
    queryKey: keys.workers(status, query, page),
    queryFn: () =>
      apiFetch<WorkerPage>(
        `/workers/page${queryString({
          page,
          pageSize: PAGE_SIZE,
          query,
          status,
        })}`
      ),
    staleTime: MINUTE,
  });

/**
 * The whole shelf in one call — `/inventory` is not paged.
 *
 * That is fine at gym scale (hundreds of products, not thousands) and it is what
 * lets the status tiles count from the same array the list renders, rather than
 * asking the backend for a tally it does not offer on this route.
 */
export const inventoryQuery = () =>
  queryOptions({
    queryKey: keys.inventory,
    queryFn: () => apiFetch<InventoryItem[]>("/inventory"),
    staleTime: MINUTE,
  });

export const attendanceQuery = (
  from: string,
  to: string,
  query: string,
  page: number
) =>
  queryOptions({
    queryKey: keys.attendance(from, to, query, page),
    queryFn: () =>
      apiFetch<AttendancePage>(
        `/attendance/sessions${queryString({
          from,
          page,
          pageSize: PAGE_SIZE,
          query,
          to,
        })}`
      ),
    staleTime: MINUTE,
  });
