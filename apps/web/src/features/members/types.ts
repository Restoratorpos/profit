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

export interface MemberPlanBadge {
  count: number;
  name: string;
}

export interface MemberListItem {
  birthdate: string | null;
  branchId: string | null;
  /** Latest end across their memberships, ISO. */
  endsAt: string | null;
  gender: string | null;
  /** True when a face is enrolled on at least one terminal. */
  hasFace: boolean;
  id: string;
  isActive: boolean;
  /** Decimal string. "0.00" means nothing owed. */
  membershipDebt: string;
  name: string;
  phone: string | null;
  plans: MemberPlanBadge[];
  /** Null when no membership counts visits. */
  remainingVisits: number | null;
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
