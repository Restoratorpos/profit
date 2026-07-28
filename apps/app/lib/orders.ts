/** Mirrors what apps/backend returns from /orders. */

import {
  type ComboListItem,
  isIngredient,
  type ProductListItem,
} from "./catalog";
import type { Locale } from "./i18n/config";
import {
  endsChain,
  legTakes,
  type PaymentLeg,
  visibleLegCount,
} from "./payment-legs";

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
} from "./payment-legs";

/**
 * Who can carry a shop balance. A walk-in guest pays at the till, so only these
 * two ever reach the debt screen.
 */
export const DEBTOR_TYPES = ["member", "worker"] as const;

export type DebtorType = (typeof DEBTOR_TYPES)[number];

/** One line on the orders screen: a buyer and what they owe in the shop. */
export interface MemberOrderSummary {
  id: string;
  /** ISO; the most recent order, used by the date-range filter. */
  latestOrderAt: string | null;
  name: string;
  orderCount: number;
  phone: string | null;
  /** Decimal string. "0.00" means the balance is settled. */
  remaining: string;
  /** Everything ever ordered, paid or not — decimal string. */
  total: string;
  /** A member or a member of staff — the row's left edge is coloured by this. */
  userType: DebtorType;
}

export interface OrderItemView {
  /** The `order_rep_id`, a stable key for the line. */
  id: string;
  /** A combo line is priced as a bundle — the edit sheet badges it as one. */
  isCombo: boolean;
  lineTotal: string;
  name: string;
  price: string;
  quantity: number;
}

/** One order in a member's history, with its own line items and paid split. */
export interface MemberOrderView {
  createdAt: string | null;
  id: string;
  items: OrderItemView[];
  paid: string;
  remaining: string;
  settledAt: string | null;
  total: string;
}

export interface MemberOrderDetail {
  member: { id: string; name: string; phone: string | null };
  orders: MemberOrderView[];
  paid: string;
  remaining: string;
  total: string;
}

/**
 * What the detail/pay Server Actions hand back. It lives here rather than beside
 * the actions because a "use server" module may only export async functions.
 */
export interface OrderDetailResult {
  detail?: MemberOrderDetail;
  error?: string;
  ok: boolean;
}

/**
 * Only money-in methods clear a debt. `debt`/`free` describe how a sale was
 * made, not how a balance is paid off, so the pay drawer never offers them.
 */
export const ORDER_PAYMENT_TYPES = ["cash", "card"] as const;

export type OrderPaymentType = (typeof ORDER_PAYMENT_TYPES)[number];

/**
 * Checkout adds two that take no money. `debt` leaves the total owing, so only a
 * member can carry it; `free` is a comp — nothing taken, nothing owed, settled on
 * the spot, which is why a walk-in may have one.
 */
export const ORDER_CHECKOUT_TYPES = ["cash", "card", "debt", "free"] as const;

export type OrderCheckoutType = (typeof ORDER_CHECKOUT_TYPES)[number];

/** What a checkout takes now and what it leaves owing. */
export interface OrderSettlement {
  /** What each leg actually covers, in order. Same length as the legs given. */
  applied: number[];
  /** What is handed over in total, never more than the total. */
  paid: number;
  remaining: number;
}

/**
 * How a sale settles, given the legs the desk has entered so far.
 *
 * Pure, and lives here rather than in the composer, because two places need the
 * same answer: the figures shown on screen and the request the checkout button
 * sends. Computed twice they could disagree, and the number that would be
 * wrong is somebody's debt.
 *
 * This mirrors `settleCheckout` on the backend, which is the one that counts —
 * the server recomputes all of it from its own prices. What is here exists so
 * the desk can see the qoldiq shrink as it types.
 *
 * A leg with a blank box takes whatever is still outstanding, which is what the
 * last one usually wants. `debt` and `free` take nothing and end the walk:
 * every leg after one of them is a control the operator has stopped using.
 */
export const settlementOf = (
  total: number,
  legs: readonly PaymentLeg[]
): OrderSettlement => {
  const applied: number[] = [];
  let outstanding = total;
  let isStopped = false;

  for (const leg of legs) {
    // Past the end of the walk: either the sale is covered or a qarz/comp has
    // already said what becomes of the rest. Anything here is a control the
    // operator left behind, and counting it would spend money twice.
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
    }
  }

  return { applied, paid: total - outstanding, remaining: outstanding };
};

/**
 * Whether this sale still leaves a balance behind — which only a member can
 * carry, so it is what decides whether a customer has to be picked.
 *
 * Read off the legs that are actually on screen: one the operator has scrolled
 * past cannot be what makes a walk-in owe money.
 */
export const isOwed = (total: number, legs: readonly PaymentLeg[]): boolean => {
  const shown = legs.slice(0, visibleLegCount(total, legs));
  const { remaining } = settlementOf(total, shown);

  return remaining > 0 && shown.at(-1)?.method !== "free";
};

/** The slice of a member the POS customer picker needs. */
export interface OrderCustomer {
  id: string;
  name: string;
  phone: string | null;
}

/**
 * A sellable POS tile — a product or a combo. Both are rung up the same way; the
 * `kind` decides whether checkout sends a `productId` or a `comboId`. A combo has
 * no colour of its own, so its tile falls back to the default background.
 */
export interface PosProduct {
  color: string | null;
  id: string;
  kind: "product" | "combo";
  name: string;
  price: string | null;
  productType: string | null;
}

/**
 * The one sellable list both the POS grid and the edit sheet's product picker
 * read from: active products and every combo, tagged so a caller knows which id
 * to send. Built server-side so only these fields cross the RSC boundary.
 *
 * Ingredients are excluded. They are raw materials with no sale price, so a
 * ringable tile for one would sell it for nothing — they reach the till only as
 * part of a combo's cost.
 */
export const toPosProducts = (
  products: readonly ProductListItem[],
  combos: readonly ComboListItem[]
): PosProduct[] => [
  ...products
    .filter((product) => product.isActive && !isIngredient(product))
    .map((product) => ({
      color: product.color,
      id: product.id,
      kind: "product" as const,
      name: product.name,
      price: product.price,
      productType: product.productType,
    })),
  ...combos.map((combo) => ({
    color: null,
    id: combo.id,
    kind: "combo" as const,
    name: combo.name,
    price: combo.price,
    productType: combo.productType,
  })),
];

/**
 * Why units came off a line. The key is what gets stored, so the desk's wording
 * can be retranslated later without rewriting history.
 */
export const REMOVAL_REASONS = [
  "changed_mind",
  "customer_fault",
  "wrong_item",
  "damaged",
  "other",
] as const;

export type RemovalReason = (typeof REMOVAL_REASONS)[number];

/**
 * Where the removed units went. `returned` puts them back on the shelf; `wasted`
 * writes them off, so stock on hand does not rise and the loss is recorded as
 * waste rather than vanishing.
 */
export const REMOVAL_DISPOSITIONS = ["wasted", "returned"] as const;

export type RemovalDisposition = (typeof REMOVAL_DISPOSITIONS)[number];

/** The reason and destination captured for one line the operator cut down. */
export interface RemovalDetail {
  disposition: RemovalDisposition;
  reason: RemovalReason;
}

/**
 * What the edit sheet sends: the new quantity for lines the operator touched
 * (`0` removes the line) plus products appended to their newest open order. A
 * line that loses units carries why and where — the backend refuses it otherwise.
 */
export interface OrderEditInput {
  added: { comboId?: string; productId?: string; quantity: number }[];
  lines: {
    disposition?: RemovalDisposition;
    id: string;
    quantity: number;
    reason?: RemovalReason;
  }[];
}

/** Which tab of the orders list is showing. */
export const ORDER_FILTERS = ["unpaid", "paid", "all"] as const;

export type OrderFilter = (typeof ORDER_FILTERS)[number];

/** The date-range shortcuts above the list. `all` clears both bounds. */
export const DATE_PRESETS = ["today", "week", "month", "year", "all"] as const;

export type DatePreset = (typeof DATE_PRESETS)[number];

/** A member owes money when their remaining balance is above zero. */
export const hasDebt = (value: string): boolean => Number(value) > 0;

const LOCALE_TAG: Record<Locale, string> = {
  uz: "uz-UZ",
  ru: "ru-RU",
  en: "en-US",
};

/** `"YYYY-MM-DD"` from a Date, in local time — the value a date input holds. */
export const toDateInput = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

/**
 * The [from, to] a preset selects, as `"YYYY-MM-DD"` bounds the date inputs can
 * show and edit. Ranges are "the last week/month/year up to today", which is how
 * the desk reads them — everything since a point back from now.
 */
export const rangeForPreset = (
  preset: DatePreset
): { from: string; to: string } => {
  const now = new Date();
  const to = toDateInput(now);
  const from = new Date(now);

  switch (preset) {
    case "today":
      break;
    case "week":
      from.setDate(from.getDate() - 7);
      break;
    case "month":
      from.setMonth(from.getMonth() - 1);
      break;
    case "year":
      from.setFullYear(from.getFullYear() - 1);
      break;
    default:
      return { from: "", to: "" };
  }

  return { from: toDateInput(from), to };
};

/** Inclusive membership test for a member's latest-order day against a range. */
export const isWithinRange = (
  isoDate: string | null,
  from: string,
  to: string
): boolean => {
  if (!isoDate) {
    // No orders in range means no order date to place — hide when bounded.
    return from.length === 0 && to.length === 0;
  }

  const day = toDateInput(new Date(isoDate));

  if (from.length > 0 && day < from) {
    return false;
  }

  if (to.length > 0 && day > to) {
    return false;
  }

  return true;
};

const parseDate = (value: string | null): Date | null => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/** `"6 iyul 2026, 01:20"` — the localised stamp shown on an order. */
export const formatDateTime = (
  value: string | null,
  locale: Locale
): string => {
  const parsed = parseDate(value);

  if (!parsed) {
    return "—";
  }

  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
};

/** `"6 iyul 2026"` — the day header a group of orders sits under. */
export const formatDayLabel = (
  value: string | null,
  locale: Locale
): string => {
  const parsed = parseDate(value);

  if (!parsed) {
    return "—";
  }

  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parsed);
};

/** `"01:20"` — just the time, shown per order beneath its day header. */
export const formatTime = (value: string | null, locale: Locale): string => {
  const parsed = parseDate(value);

  if (!parsed) {
    return "—";
  }

  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
};

/** The calendar day of an ISO value, for grouping orders under one header. */
export const dayKeyOf = (value: string | null): string => {
  const parsed = parseDate(value);

  return parsed ? toDateInput(parsed) : "unknown";
};

export const initialOf = (name: string): string =>
  name.trim().charAt(0).toUpperCase() || "?";
