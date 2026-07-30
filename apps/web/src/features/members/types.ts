/** Mirrors what apps/backend returns from /members. */

import { endsChain, legTakes, type PaymentLeg } from "@/lib/payment-legs";

export {
  canTypeAmount,
  firstLeg,
  isFinalLeg,
  MAX_PAYMENT_LEGS,
  needsTill,
  type PaymentLeg,
  type Till,
  toPayments,
  visibleLegCount,
  withLeg,
} from "@/lib/payment-legs";

/** Where one membership stands: mirrors the backend's `MembershipState`. */
export type MembershipState = "active" | "expiring" | "expired";

/** One membership a member holds, with its own end date, visits and money. */
export interface MemberMembership {
  /** Decimal string. Still owed on this one membership: `price - paid`. */
  debt: string;
  endsAt: string | null;
  id: string;
  /** The plan name. There is no category on `plans`, so this is the type. */
  name: string;
  /** Decimal string. Taken so far against this membership. */
  paid: string;
  /** Which plan it is, so a renewal of the same one can be told apart. */
  planId: string | null;
  /**
   * Decimal string. What it was **charged** — a comp records what was actually
   * taken, so "0.00 paid of 0.00" is a gift rather than an unpaid sale.
   */
  price: string;
  remainingVisits: number | null;
  startsAt: string | null;
  state: MembershipState;
  /** What it was sold with, so "76 of 80" can be read rather than just "76". */
  totalVisits: number | null;
}

/** One time a member came in. */
export interface MemberVisit {
  at: string | null;
  id: number;
}

export interface MemberListItem {
  birthdate: string | null;
  branchId: string | null;
  /**
   * The **soonest upcoming** expiry across their memberships, ISO, or null when
   * none is still running. Not the latest — that hid a lapsing gym plan behind
   * a year-long sauna package.
   */
  endsAt: string | null;
  gender: string | null;
  /** True when a face is enrolled on at least one terminal. */
  hasFace: boolean;
  id: string;
  isActive: boolean;
  /** Decimal string. "0.00" means nothing owed. */
  membershipDebt: string;
  /**
   * Every membership they hold, in the order they were sold, each with its own
   * clock. The first entry is the plan they were originally signed up on.
   */
  memberships: MemberMembership[];
  name: string;
  phone: string | null;
  shopDebt: string;
  startsAt: string | null;
  uniqueId: string | null;
}

/** The slice of a plan the member sheet needs — see members/page.tsx. */
export interface PlanOption {
  id: string;
  name: string;
  price: string;
}

export const MEMBER_GENDERS = ["male", "female"] as const;

export type MemberGender = (typeof MEMBER_GENDERS)[number];

export const PAYMENT_TYPES = ["cash", "card", "debt", "free"] as const;

export type PaymentType = (typeof PAYMENT_TYPES)[number];

export interface Settlement {
  /** What each leg actually covers, in order. Same length as the legs given. */
  applied: number[];
  debt: number;
  paid: number;
  /** What the membership is recorded as costing — zero for a comp. */
  total: number;
}

/**
 * What a plan sale charges, collects and leaves owing, given the legs so far.
 *
 * Mirrors `settleMembership` on the backend, which is the one that counts — the
 * server recomputes all of it from the plan's own price. This exists so the
 * desk can watch the qoldiq shrink as it types.
 *
 * A comped membership is not a sale that went unpaid: nothing was charged, so
 * the total is zero rather than the list price and there is nothing to owe.
 * That distinction is what keeps `free` and `debt` apart — both take no money,
 * but only one leaves a balance behind. A comp *after* a part payment is the
 * same idea a step in: charged down to what was actually taken.
 */
export const settlementOf = (
  listPrice: number,
  legs: readonly PaymentLeg[]
): Settlement => {
  const applied: number[] = [];
  let outstanding = listPrice;
  let isWaived = false;
  let isStopped = false;

  for (const leg of legs) {
    if (isStopped || outstanding <= 0) {
      applied.push(0);
      continue;
    }

    // A qarz still takes whatever was typed against it — that is a part payment
    // on a credit sale — and then ends the walk, because the rest is owed.
    const taken = legTakes(leg, outstanding);

    applied.push(taken);
    outstanding -= taken;

    if (endsChain(leg.method)) {
      isStopped = true;
      isWaived = leg.method === "free";
    }
  }

  const paid = listPrice - outstanding;

  return {
    applied,
    debt: isWaived ? 0 : outstanding,
    paid,
    total: isWaived ? paid : listPrice,
  };
};

/** Which slice of the roster the list is showing. */
export const MEMBER_FILTERS = [
  "all",
  "active",
  "expiring",
  "inactive",
] as const;

export type MemberFilter = (typeof MEMBER_FILTERS)[number];

/**
 * Who owes money, and for what. `null` is "not filtered by debt" — there is no
 * option meaning that, because not choosing one already says it.
 */
export const DEBT_FILTERS = ["any", "membership", "shop"] as const;

export type DebtFilter = (typeof DEBT_FILTERS)[number];

/** What the list screen asks the backend for. */
export interface MemberQuery {
  debt: DebtFilter | null;
  filter: MemberFilter;
  page: number;
  pageSize: number;
  query: string;
}

/** What the list opens on, and what a reset returns to. */
export const DEFAULT_MEMBER_QUERY: MemberQuery = {
  debt: null,
  filter: "all",
  page: 1,
  pageSize: 25,
  query: "",
};

export interface MemberCounts {
  debt: { any: number; membership: number; shop: number };
  status: { active: number; all: number; expiring: number; inactive: number };
}

/**
 * One page of the roster. Search, filtering and paging all happen in
 * apps/backend now — the browser receives what it renders and nothing else, so
 * these counts are the backend's tally over the whole roster rather than
 * something this app can recompute from `rows`.
 */
export interface MemberPage {
  counts: MemberCounts;
  rows: MemberListItem[];
  total: number;
}

/** A debt column shows a dash rather than "0", which reads as a real figure. */
export const hasDebt = (value: string): boolean => Number(value) > 0;

/** Dates come back ISO; only the day is ever shown. */
export const formatDay = (value: string | null): string => {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

/** Today as "YYYY-MM-DD" in local time — the default membership start. */
export const todayIso = (): string => formatDay(new Date().toISOString());

export const initialOf = (name: string): string =>
  name.trim().charAt(0).toUpperCase() || "?";

/*
 * Month names spelled out here rather than taken from `Intl`.
 *
 * The runtime's `uz-UZ` data is not consistent across browsers — some ship the
 * Cyrillic month names, some fall back to English, and a date that reads
 * differently on the desk terminal than on the manager's laptop is a support
 * call. A fixed list is the same everywhere.
 */
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** `"26-July, 2026"` — how a date reads wherever it is shown to the desk. */
export const formatLongDay = (value: string | null): string => {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return `${parsed.getDate()}-${MONTHS[parsed.getMonth()]}, ${parsed.getFullYear()}`;
};

/** `"26-July, 2026"` and `"08:18"` — how a visit reads in the list. */
export const formatVisit = (
  value: string | null
): { day: string; time: string } => {
  if (!value) {
    return { day: "—", time: "" };
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return { day: "—", time: "" };
  }

  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");

  return { day: formatLongDay(value), time: `${hours}:${minutes}` };
};
