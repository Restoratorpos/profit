/**
 * Wire shapes. Mirrors `apps/backend/src/services/*.service.ts`.
 *
 * Restated rather than imported from the `types.ts` in each of apps/web's
 * feature folders: those files pull in `@repo/design-system` and the web i18n
 * dictionary for their label maps, neither of which exists in React Native.
 * Only the shapes this app renders are here — when the backend changes one,
 * change it here too.
 *
 * Every money field is a **decimal string**, not a number. That is how MySQL's
 * DECIMAL comes back over JSON and rounding it on arrival is how a total stops
 * matching the desk.
 */

export type UserRole =
  | "owner"
  | "admin"
  | "manager"
  | "trainer"
  | "receptionist";

export interface AuthUser {
  branchId: string | null;
  gymId: string;
  id: string;
  name: string;
  phone: string;
  role: UserRole;
}

/** What `/auth/login` answers with under the default `mode: "token"`. */
export interface SessionResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

/* ---------------------------------------------------------------- dashboard */

export type Cashbox = "cash" | "card" | "transfer";

export type CashboxBalances = Record<Cashbox, string>;

export type MembershipState = "active" | "expiring" | "expired";

export type StockStatus = "in" | "low" | "out";

export interface Presence {
  members: number;
  workers: number;
}

export interface TodayFigures {
  expense: string;
  orders: number;
  revenue: string;
  visits: number;
}

export interface MemberStanding {
  active: number;
  expiring: number;
  joinedThisMonth: number;
  lapsed: number;
  total: number;
}

export interface Receivables {
  membership: string;
  shop: string;
  supplier: string;
}

export interface ExpiringMembership {
  endsAt: string | null;
  id: string;
  memberId: string;
  name: string;
  phone: string | null;
  plan: string;
  remainingVisits: number | null;
  state: MembershipState;
}

export interface LowStockRow {
  id: string;
  name: string;
  status: StockStatus;
  stock: string;
  unit: string | null;
}

export interface DebtorRow {
  id: string;
  name: string;
  remaining: string;
  type: "member" | "worker";
}

export interface DashboardSnapshot {
  attention: {
    debtors: DebtorRow[];
    expiring: ExpiringMembership[];
    lowStock: LowStockRow[];
  };
  cashboxes: CashboxBalances;
  members: MemberStanding;
  presence: Presence;
  receivables: Receivables;
  stock: { low: number; out: number };
  today: TodayFigures;
}

export interface RevenuePoint {
  /** Local calendar day, `YYYY-MM-DD`. */
  date: string;
  expense: number;
  membership: number;
  other: number;
  shop: number;
}

export interface RevenueTotals {
  expense: string;
  membership: string;
  net: string;
  other: string;
  revenue: string;
  shop: string;
}

export interface TopProduct {
  id: string;
  name: string;
  quantity: string;
  revenue: string;
}

export interface RevenueReport {
  days: number;
  points: RevenuePoint[];
  previous: RevenueTotals;
  topProducts: TopProduct[];
  totals: RevenueTotals;
}

/** What one column of the chart is worth, all three sources together. */
export const pointTotal = (point: RevenuePoint): number =>
  point.membership + point.shop + point.other;

/* ------------------------------------------------------------------ members */

export interface MemberMembership {
  debt: string;
  endsAt: string | null;
  id: string;
  name: string;
  paid: string;
  price: string;
  remainingVisits: number | null;
  startsAt: string | null;
  state: MembershipState;
  totalVisits: number | null;
}

export interface MemberListItem {
  birthdate: string | null;
  branchId: string | null;
  /** The **soonest** upcoming expiry across their memberships, or null. */
  endsAt: string | null;
  gender: string | null;
  hasFace: boolean;
  id: string;
  isActive: boolean;
  membershipDebt: string;
  memberships: MemberMembership[];
  name: string;
  phone: string | null;
  shopDebt: string;
  startsAt: string | null;
  uniqueId: string | null;
}

export interface MemberCounts {
  debt: { any: number; membership: number; shop: number };
  status: { active: number; all: number; expiring: number; inactive: number };
}

export interface MemberPage {
  counts: MemberCounts;
  rows: MemberListItem[];
  total: number;
}

export const MEMBER_FILTERS = [
  "all",
  "active",
  "expiring",
  "inactive",
] as const;

export type MemberFilter = (typeof MEMBER_FILTERS)[number];

/* ------------------------------------------------------------------ workers */

export interface WorkerListItem {
  balance: string | null;
  earned: string | null;
  hasFace: boolean;
  hiredAt: string | null;
  id: string;
  isActive: boolean;
  minutesWorked: number;
  name: string;
  onShiftNow: boolean;
  openSince: string | null;
  paid: string;
  phone: string | null;
  role: string | null;
  salaryAmount: string;
  salaryType: string;
  shiftEnd: string | null;
  shiftStart: string | null;
  workingDays: number[];
}

export const WORKER_FILTERS = [
  "active",
  "on-shift",
  "inactive",
  "all",
] as const;

export type WorkerFilter = (typeof WORKER_FILTERS)[number];

export type WorkerCounts = Record<WorkerFilter, number>;

export interface WorkerPage {
  counts: WorkerCounts;
  rows: WorkerListItem[];
  total: number;
}

/* ---------------------------------------------------------------- inventory */

export interface InventoryItem {
  cost: string | null;
  id: string;
  name: string;
  price: string | null;
  productType: string | null;
  status: StockStatus;
  /** On hand. Signed: negative means more went out than was booked in. */
  stock: string;
  /** This product's share of what is still owed on the deliveries that brought it in. */
  supplierDebt: string;
  unit: string | null;
}

export const STOCK_FILTERS = ["total", "in", "low", "out"] as const;

export type StockFilter = (typeof STOCK_FILTERS)[number];

export interface StockCounts {
  in: number;
  low: number;
  out: number;
  total: number;
}

export const countByStatus = (items: readonly InventoryItem[]): StockCounts => {
  const counts: StockCounts = { in: 0, low: 0, out: 0, total: items.length };

  for (const item of items) {
    counts[item.status] += 1;
  }

  return counts;
};

/* --------------------------------------------------------------- attendance */

/** One member, not one entry: their last visit in the range and how many. */
export interface AttendanceRow {
  at: string | null;
  memberId: string;
  name: string;
  phone: string | null;
  /** Sessions left **as of now**, not as of any visit on this row. */
  remainingVisits: number | null;
  uniqueId: string | null;
  visits: number;
}

export interface AttendancePage {
  rows: AttendanceRow[];
  /** Members who came in the range — what the pager counts. */
  total: number;
  /** Visits across all of them — the header figure. */
  visits: number;
}

/* --------------------------------------------------------------------- gym  */

export interface GymBranchView {
  id: string;
  name: string;
}

/** `GET /gym` — mirrors the backend's `GymSettingsView`. */
export interface GymSettingsView {
  branches: GymBranchView[];
  branchId: string | null;
  branchName: string | null;
  closeTime: string | null;
  id: string;
  name: string;
  openTime: string | null;
  ownerName: string | null;
  phone: string | null;
  planTier: string | null;
}
