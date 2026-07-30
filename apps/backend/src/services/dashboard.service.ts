import {
  and,
  desc,
  eq,
  gte,
  isNull,
  lt,
  ne,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { db } from "../db/index.js";
import {
  attendanceSessions,
  expenses,
  income,
  members,
  orderItems,
  orders,
} from "../db/schema.js";
import type { RevenueQuery } from "../schemas/dashboard.js";
import { TRANSFER_CATEGORY } from "../schemas/transaction.js";
import {
  type InventoryItem,
  listStock,
  listSuppliers,
} from "./inventory.service.js";
import {
  listMembers,
  type MemberListItem,
  type MembershipState,
} from "./member.service.js";
import {
  listMemberOrderDebts,
  type MemberOrderSummary,
} from "./order.service.js";
import {
  type CashboxBalances,
  getCashboxSummary,
} from "./transaction.service.js";

/**
 * The home screen.
 *
 * **This service derives almost nothing itself.** Where a figure already has an
 * owner — what members owe, what is on the shelf, what each till holds — the
 * dashboard calls that owner rather than writing a second query for the same
 * number. A dashboard that computes its own version of a balance is a dashboard
 * that eventually disagrees with the screen it links to, and the operator has no
 * way to tell which of the two is lying.
 *
 * What it does own is the handful of questions no other screen asks: who is
 * inside the building right now, and what the money looked like day by day.
 */

/** Every query filters by gymId. An unscoped one is a data leak, not a bug. */

/**
 * Income categories that are not takings.
 *
 * `cash_move` is the gym moving its own money between tills — counting it would
 * report a trip to the bank as a day's trading. `owner_deposit` is the owner
 * putting capital *in*; it is money the business now holds, but it is not
 * something the gym earned, and a dashboard that lets it inflate revenue makes
 * the one figure the owner checks unusable.
 */
const NON_REVENUE_INCOME: string[] = [TRANSFER_CATEGORY, "owner_deposit"];

/**
 * Expense categories that are not spending.
 *
 * `cash_move` is the other half of a transfer. `sup_return` is a credit note —
 * goods going back to a supplier reduce what is owed without a note leaving the
 * drawer, so it is a smaller debt, not an expense.
 */
const NON_EXPENSE_OUTGOINGS: string[] = [TRANSFER_CATEGORY, "sup_return"];

/** How many rows each "needs attention" list carries. */
const ATTENTION_LIMIT = 6;

/** How many products the range report ranks. */
const TOP_PRODUCT_LIMIT = 5;

const MS_PER_DAY = 86_400_000;

const toMoney = (value: number): string => value.toFixed(2);

/** MySQL returns DECIMAL as a string; SUM() of nothing comes back null. */
const toNumber = (value: string | number | null): number => {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed) ? parsed : 0;
};

/** Midnight local to the server, which is where the desk's day starts. */
const startOfToday = (): Date => {
  const now = new Date();

  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

const startOfMonth = (): Date => {
  const now = new Date();

  return new Date(now.getFullYear(), now.getMonth(), 1);
};

/** `2026-07-31` in local time — the key both money queries group on. */
const toDayKey = (date: Date): string => {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
};

/**
 * Where the money came from, in the three buckets the chart plots.
 *
 * Deliberately coarser than `income.category`: a stacked column with seven
 * segments is unreadable, and the desk's question is "was it memberships or the
 * bar", not "was it hall rent or a locker sale".
 */
export type RevenueSource = "membership" | "shop" | "other";

export const revenueSourceOf = (category: string | null): RevenueSource => {
  if (category === "membership") {
    return "membership";
  }

  if (category === "order") {
    return "shop";
  }

  return "other";
};

/** One day of the trend chart. Numbers, not strings — the chart does arithmetic. */
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
  /** Takings minus spending over the window. Negative is a real answer. */
  net: string;
  other: string;
  revenue: string;
  shop: string;
}

/** One line of the "what sold" table. */
export interface TopProduct {
  id: string;
  name: string;
  quantity: string;
  revenue: string;
}

export interface RevenueReport {
  days: number;
  points: RevenuePoint[];
  /**
   * The same totals over the window immediately before this one, so the tiles
   * can show a change rather than a bare number. Null-free: a gym with no
   * history reports zeros, and "no change from zero" is honest.
   */
  previous: RevenueTotals;
  topProducts: TopProduct[];
  totals: RevenueTotals;
}

const emptyPoint = (date: string): RevenuePoint => ({
  date,
  expense: 0,
  membership: 0,
  other: 0,
  shop: 0,
});

export const summariseRevenue = (
  points: readonly RevenuePoint[]
): RevenueTotals => {
  let membership = 0;
  let other = 0;
  let shop = 0;
  let expense = 0;

  for (const point of points) {
    membership += point.membership;
    other += point.other;
    shop += point.shop;
    expense += point.expense;
  }

  const revenue = membership + other + shop;

  return {
    expense: toMoney(expense),
    membership: toMoney(membership),
    net: toMoney(revenue - expense),
    other: toMoney(other),
    revenue: toMoney(revenue),
    shop: toMoney(shop),
  };
};

/**
 * Every day in `[from, to)`, in order, whether or not money moved on it.
 *
 * A chart drawn only from the days that have rows lies twice over: it closes the
 * gaps, so a quiet week looks continuous, and it rescales the axis to whatever
 * happened to be busy. The zero-filled spine is what makes an empty Tuesday
 * visible as an empty Tuesday.
 */
export const revenueSpine = (from: Date, to: Date): RevenuePoint[] => {
  const points: RevenuePoint[] = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());

  while (cursor < to) {
    points.push(emptyPoint(toDayKey(cursor)));
    cursor.setDate(cursor.getDate() + 1);
  }

  return points;
};

/**
 * Money in and out, by local calendar day.
 *
 * `DATE_FORMAT` rather than `DATE()`: mysql2 hands a `DATE` column back as a JS
 * `Date` at UTC midnight, which is the previous day for every gym east of
 * Greenwich — and every gym running this is. Grouping on a formatted string
 * keeps the day the day the desk worked.
 */
const loadMoneyBetween = async (
  gymId: string,
  from: Date,
  to: Date
): Promise<Map<string, RevenuePoint>> => {
  const day = (column: typeof income.paidAt | typeof expenses.paidAt) =>
    sql<string>`DATE_FORMAT(${column}, '%Y-%m-%d')`;

  const takingsPromise = db
    .select({
      day: day(income.paidAt),
      category: income.category,
      total: sql<string>`SUM(${income.amount})`,
    })
    .from(income)
    .where(
      and(
        eq(income.gymId, gymId),
        isNull(income.voidedAt),
        gte(income.paidAt, from),
        lt(income.paidAt, to),
        /*
         * `NOT IN` alone would silently drop rows whose category is NULL —
         * `NULL NOT IN (…)` is NULL, not true — and this database has legacy
         * income with no category. Those are takings of an unknown kind, which
         * is the `other` bucket, not money to pretend never arrived.
         */
        or(
          isNull(income.category),
          notInArray(income.category, NON_REVENUE_INCOME)
        )
      )
    )
    .groupBy(day(income.paidAt), income.category);

  const spendingPromise = db
    .select({
      day: day(expenses.paidAt),
      total: sql<string>`SUM(${expenses.amount})`,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.gymId, gymId),
        isNull(expenses.voidedAt),
        gte(expenses.paidAt, from),
        lt(expenses.paidAt, to),
        notInArray(expenses.category, NON_EXPENSE_OUTGOINGS)
      )
    )
    .groupBy(day(expenses.paidAt));

  const [takings, spending] = await Promise.all([
    takingsPromise,
    spendingPromise,
  ]);

  const byDay = new Map<string, RevenuePoint>();

  const at = (key: string): RevenuePoint => {
    const existing = byDay.get(key);

    if (existing) {
      return existing;
    }

    const created = emptyPoint(key);

    byDay.set(key, created);

    return created;
  };

  for (const row of takings) {
    at(row.day)[revenueSourceOf(row.category)] += toNumber(row.total);
  }

  for (const row of spending) {
    at(row.day).expense += toNumber(row.total);
  }

  return byDay;
};

/** Fills the spine for one window from an already-loaded day map. */
const pointsFor = (
  byDay: Map<string, RevenuePoint>,
  from: Date,
  to: Date
): RevenuePoint[] =>
  revenueSpine(from, to).map((blank) => byDay.get(blank.date) ?? blank);

/**
 * What sold in the window, by value.
 *
 * Grouped on the snapshotted `name` rather than joined to `products`, so a line
 * whose product was deleted still reports what it was sold as. Voided lines and
 * voided orders are both excluded — a returned drink was never a sale.
 */
const loadTopProducts = async (
  gymId: string,
  from: Date,
  to: Date
): Promise<TopProduct[]> => {
  const rows = await db
    .select({
      id: orderItems.productId,
      name: orderItems.name,
      quantity: sql<string>`SUM(${orderItems.quantity})`,
      revenue: sql<string>`SUM(${orderItems.lineTotal})`,
    })
    .from(orderItems)
    .innerJoin(
      orders,
      and(
        eq(orders.gymId, orderItems.gymId),
        eq(orders.orderId, orderItems.orderId)
      )
    )
    .where(
      and(
        eq(orderItems.gymId, gymId),
        isNull(orderItems.voidedAt),
        ne(orders.status, "void"),
        gte(orders.createdAt, from),
        lt(orders.createdAt, to)
      )
    )
    .groupBy(orderItems.productId, orderItems.name)
    .orderBy(desc(sql`SUM(${orderItems.lineTotal})`))
    .limit(TOP_PRODUCT_LIMIT);

  return rows.map((row) => ({
    id: row.id ?? "",
    name: row.name ?? "",
    quantity: toNumber(row.quantity).toString(),
    revenue: toMoney(toNumber(row.revenue)),
  }));
};

/**
 * The trend, its totals, and the window before it for comparison.
 *
 * Both windows are read in **one** pass over `income`/`expenses` — the previous
 * window is the same query with twice the reach, split in memory. Two round
 * trips instead of four, and the two halves can never be computed under
 * different rules.
 */
export const getRevenueReport = async (
  gymId: string,
  query: RevenueQuery
): Promise<RevenueReport> => {
  const { days } = query;
  const midnight = startOfToday();
  // Exclusive upper bound at tomorrow's midnight, so everything logged today is
  // in. `paid_at <= now` would drop a payment backdated to later this evening.
  const to = new Date(midnight.getTime() + MS_PER_DAY);
  const from = new Date(to.getTime() - days * MS_PER_DAY);
  const previousFrom = new Date(from.getTime() - days * MS_PER_DAY);

  const [byDay, topProducts] = await Promise.all([
    loadMoneyBetween(gymId, previousFrom, to),
    loadTopProducts(gymId, from, to),
  ]);

  const points = pointsFor(byDay, from, to);

  return {
    days,
    points,
    previous: summariseRevenue(pointsFor(byDay, previousFrom, from)),
    topProducts,
    totals: summariseRevenue(points),
  };
};

/** How many people are inside, split by which door they came through. */
export interface Presence {
  members: number;
  workers: number;
}

export interface TodayFigures {
  expense: string;
  /** Sales rung up since midnight, voided ones excluded. */
  orders: number;
  revenue: string;
  /** Member check-ins recorded for today, however they were recorded. */
  visits: number;
}

/**
 * The roster, cut the way the desk acts on it.
 *
 * `expiring` is a **subset of** `active`, not a fourth bucket beside it: a
 * membership running out on Friday is still a membership, and a tile that
 * excluded it would report the gym as smaller than it is the week before every
 * renewal. `active + lapsed = total`.
 */
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
  /** Owed *by* the gym, to suppliers — the one figure here pointing outward. */
  supplier: string;
}

/** A membership worth chasing, soonest first. */
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
  status: InventoryItem["status"];
  stock: string;
  unit: string | null;
}

export interface DebtorRow {
  id: string;
  name: string;
  remaining: string;
  type: MemberOrderSummary["userType"];
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

const loadPresence = async (gymId: string): Promise<Presence> => {
  const rows = await db
    .select({
      personType: attendanceSessions.personType,
      total: sql<string>`COUNT(*)`,
    })
    .from(attendanceSessions)
    .where(
      and(
        eq(attendanceSessions.gymId, gymId),
        isNull(attendanceSessions.checkOut)
      )
    )
    .groupBy(attendanceSessions.personType);

  const presence: Presence = { members: 0, workers: 0 };

  for (const row of rows) {
    if (row.personType === "member") {
      presence.members = toNumber(row.total);
    }

    if (row.personType === "worker") {
      presence.workers = toNumber(row.total);
    }
  }

  return presence;
};

/** Sales rung up today, and member visits recorded for today. */
const loadTodayActivity = async (
  gymId: string
): Promise<{ orders: number; visits: number }> => {
  const midnight = startOfToday();

  const ordersPromise = db
    .select({ total: sql<string>`COUNT(*)` })
    .from(orders)
    .where(
      and(
        eq(orders.gymId, gymId),
        ne(orders.status, "void"),
        gte(orders.createdAt, midnight)
      )
    );

  const visitsPromise = db
    .select({ total: sql<string>`COUNT(*)` })
    .from(attendanceSessions)
    .where(
      and(
        eq(attendanceSessions.gymId, gymId),
        eq(attendanceSessions.personType, "member"),
        eq(attendanceSessions.workDate, toDayKey(midnight))
      )
    );

  const [[ordersRow], [visitsRow]] = await Promise.all([
    ordersPromise,
    visitsPromise,
  ]);

  return {
    orders: toNumber(ordersRow?.total ?? 0),
    visits: toNumber(visitsRow?.total ?? 0),
  };
};

const loadJoinedThisMonth = async (gymId: string): Promise<number> => {
  const [row] = await db
    .select({ total: sql<string>`COUNT(*)` })
    .from(members)
    .where(
      and(eq(members.gymId, gymId), gte(members.joinedAt, startOfMonth()))
    );

  return toNumber(row?.total ?? 0);
};

/**
 * Reduces the roster the /members screen already assembled.
 *
 * The whole roster is loaded rather than counted in SQL on purpose: the states
 * this counts — expiring on visits *or* on days — are computed in
 * `member.service`, not stored, and a second copy of that rule in SQL is how the
 * dashboard starts reporting a different number of expiring members than the
 * screen the operator opens to act on them.
 */
export const summariseStanding = (
  roster: readonly MemberListItem[]
): MemberStanding => {
  let active = 0;
  let expiring = 0;

  for (const member of roster) {
    if (!member.isActive) {
      continue;
    }

    let hasLive = false;
    let hasExpiring = false;

    for (const membership of member.memberships) {
      if (membership.state === "expired") {
        continue;
      }

      hasLive = true;

      if (membership.state === "expiring") {
        hasExpiring = true;
      }
    }

    if (hasLive) {
      active += 1;
    }

    if (hasExpiring) {
      expiring += 1;
    }
  }

  return {
    active,
    expiring,
    joinedThisMonth: 0,
    lapsed: roster.length - active,
    total: roster.length,
  };
};

/**
 * Memberships about to run out, soonest first.
 *
 * Visit-counted packages have no end date, so they cannot be ordered against
 * dated ones — they are appended after, in fewest-visits-first order, rather
 * than being given a fabricated date to sort by.
 */
const expiringFrom = (
  roster: readonly MemberListItem[]
): ExpiringMembership[] => {
  const dated: ExpiringMembership[] = [];
  const byVisits: ExpiringMembership[] = [];

  for (const member of roster) {
    if (!member.isActive) {
      continue;
    }

    for (const membership of member.memberships) {
      if (membership.state !== "expiring") {
        continue;
      }

      const row: ExpiringMembership = {
        endsAt: membership.endsAt,
        id: membership.id,
        memberId: member.id,
        name: member.name,
        phone: member.phone,
        plan: membership.name,
        remainingVisits: membership.remainingVisits,
        state: membership.state,
      };

      if (membership.endsAt) {
        dated.push(row);
      } else {
        byVisits.push(row);
      }
    }
  }

  dated.sort((a, b) => (a.endsAt ?? "").localeCompare(b.endsAt ?? ""));
  byVisits.sort((a, b) => (a.remainingVisits ?? 0) - (b.remainingVisits ?? 0));

  return [...dated, ...byVisits].slice(0, ATTENTION_LIMIT);
};

const membershipDebtOf = (roster: readonly MemberListItem[]): number => {
  let total = 0;

  for (const member of roster) {
    total += toNumber(member.membershipDebt);
  }

  return total;
};

/** The largest shop balances, and what they come to across everybody. */
const shopDebtOf = (
  buyers: readonly MemberOrderSummary[]
): { debtors: DebtorRow[]; total: number } => {
  let total = 0;
  const owing: DebtorRow[] = [];

  for (const buyer of buyers) {
    const remaining = toNumber(buyer.remaining);

    if (remaining <= 0) {
      continue;
    }

    total += remaining;
    owing.push({
      id: buyer.id,
      name: buyer.name,
      remaining: buyer.remaining,
      type: buyer.userType,
    });
  }

  owing.sort((a, b) => toNumber(b.remaining) - toNumber(a.remaining));

  return { debtors: owing.slice(0, ATTENTION_LIMIT), total };
};

const stockOf = (
  items: readonly InventoryItem[]
): { low: number; out: number; rows: LowStockRow[] } => {
  let low = 0;
  let out = 0;
  const rows: LowStockRow[] = [];

  for (const item of items) {
    if (item.status === "in") {
      continue;
    }

    if (item.status === "low") {
      low += 1;
    } else {
      out += 1;
    }

    rows.push({
      id: item.id,
      name: item.name,
      status: item.status,
      stock: item.stock,
      unit: item.unit,
    });
  }

  // Emptiest first — "out" before "low", and least stock inside each.
  rows.sort((a, b) => toNumber(a.stock) - toNumber(b.stock));

  return { low, out, rows: rows.slice(0, ATTENTION_LIMIT) };
};

const supplierPayableOf = (rows: readonly { remaining: string }[]): number => {
  let total = 0;

  for (const row of rows) {
    total += toNumber(row.remaining);
  }

  return total;
};

/**
 * Everything the home screen shows that is true *now* rather than over a range.
 *
 * Nine reads, all started together. They are independent — nothing here feeds
 * anything else here — so awaiting them in sequence would make the slowest
 * screen in the app out of the one the operator opens first.
 */
export const getDashboardSnapshot = async (
  gymId: string
): Promise<DashboardSnapshot> => {
  const midnight = startOfToday();
  const to = new Date(midnight.getTime() + MS_PER_DAY);

  const [
    presence,
    activity,
    joinedThisMonth,
    money,
    cashboxes,
    roster,
    buyers,
    stock,
    suppliers,
  ] = await Promise.all([
    loadPresence(gymId),
    loadTodayActivity(gymId),
    loadJoinedThisMonth(gymId),
    loadMoneyBetween(gymId, midnight, to),
    getCashboxSummary(gymId),
    listMembers(gymId),
    listMemberOrderDebts(gymId),
    listStock(gymId),
    listSuppliers(gymId),
  ]);

  const today = summariseRevenue(pointsFor(money, midnight, to));
  const shop = shopDebtOf(buyers);
  const shelves = stockOf(stock);
  const standing = summariseStanding(roster);

  standing.joinedThisMonth = joinedThisMonth;

  return {
    attention: {
      debtors: shop.debtors,
      expiring: expiringFrom(roster),
      lowStock: shelves.rows,
    },
    cashboxes: cashboxes.balances,
    members: standing,
    presence,
    receivables: {
      membership: toMoney(membershipDebtOf(roster)),
      shop: toMoney(shop.total),
      supplier: toMoney(supplierPayableOf(suppliers)),
    },
    stock: { low: shelves.low, out: shelves.out },
    today: {
      expense: today.expense,
      orders: activity.orders,
      revenue: today.revenue,
      visits: activity.visits,
    },
  };
};
