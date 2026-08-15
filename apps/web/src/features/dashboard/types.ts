import type { MessageKey } from "@/lib/i18n/dictionary";

/**
 * The home screen. Mirrors apps/backend's `services/dashboard.service.ts` —
 * these are wire shapes, not a model, so keep them in step with that file.
 */

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

/**
 * The three buckets the chart stacks, in the order they are drawn — bottom
 * first. **This order is the colour assignment**: source `i` takes chart slot
 * `i + 1`, so reordering this array repaints every series and the operator who
 * learned "blue is memberships" is now being lied to. Add a fourth source at
 * the end, never in the middle.
 */
export const REVENUE_SOURCES = ["membership", "shop", "other"] as const;

export type RevenueSource = (typeof REVENUE_SOURCES)[number];

export const SOURCE_LABEL: Record<RevenueSource, MessageKey> = {
  membership: "dash.srcMembership",
  other: "dash.srcOther",
  shop: "dash.srcShop",
};

/**
 * The series colours, by slot. Held as `var(--chart-N)` rather than hex so the
 * light and dark steps swap with the theme — the two sets are the same five
 * hues re-stepped, so a series keeps its identity across the switch.
 */
export const SOURCE_COLOR: Record<RevenueSource, string> = {
  membership: "var(--chart-1)",
  other: "var(--chart-3)",
  shop: "var(--chart-2)",
};

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

/** The windows the range row offers. Mirrors `REVENUE_RANGES` on the backend. */
export const REVENUE_RANGES = [7, 30, 90] as const;

export type RevenueRange = (typeof REVENUE_RANGES)[number];

export const DEFAULT_REVENUE_RANGE: RevenueRange = 30;

export const RANGE_LABEL: Record<RevenueRange, MessageKey> = {
  7: "dash.range7",
  30: "dash.range30",
  90: "dash.range90",
};

/** What one column of the chart is worth, all three sources together. */
export const pointTotal = (point: RevenuePoint): number =>
  point.membership + point.shop + point.other;

/**
 * Grouped digits with no currency word.
 *
 * `formatMoney` appends "UZS", which is right in a table cell and wrong nine
 * times over on one screen — the tiles carry the unit once, in their label.
 */
const GROUP_FORMAT = new Intl.NumberFormat("ru-RU");

export const formatAmount = (value: string | number): string => {
  const amount = Number(value);

  return GROUP_FORMAT.format(Number.isFinite(amount) ? amount : 0);
};

/*
 * `en-US` compact, matching `formatMoney`'s locale. Axis ticks and tooltips
 * only: a full figure in millions is wider than the column it labels.
 */
const COMPACT_FORMAT = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  notation: "compact",
});

export const formatCompact = (value: number): string =>
  COMPACT_FORMAT.format(Number.isFinite(value) ? value : 0);

/**
 * The change from the window before, as a whole percent.
 *
 * Null when the previous window was zero: "up from nothing" has no percentage,
 * and rendering it as +100% (or ∞) is a number the desk would act on.
 */
export const changeFrom = (
  current: string,
  previous: string
): number | null => {
  const before = Number(previous);
  const now = Number(current);

  if (!(Number.isFinite(before) && Number.isFinite(now)) || before === 0) {
    return null;
  }

  return Math.round(((now - before) / Math.abs(before)) * 100);
};

/** `2026-07-27` → `27.07`, which is how the desk writes a date. */
export const formatDayTick = (date: string): string => {
  const [, month, day] = date.split("-");

  return month && day ? `${day}.${month}` : date;
};

/** `2026-07-27` → `27.07.2026`, for the tooltip and the table. */
export const formatDayFull = (date: string): string => {
  const [year, month, day] = date.split("-");

  return year && month && day ? `${day}.${month}.${year}` : date;
};

/**
 * Whole days until `endsAt`, or null when there is no date to count to.
 *
 * Rounded the same way the backend decides "expiring" — up, so the last day of
 * a membership reads as a day left rather than none.
 */
const MS_PER_DAY = 86_400_000;

export const daysUntil = (endsAt: string | null): number | null => {
  if (!endsAt) {
    return null;
  }

  const parsed = new Date(endsAt);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return Math.ceil((parsed.getTime() - Date.now()) / MS_PER_DAY);
};
