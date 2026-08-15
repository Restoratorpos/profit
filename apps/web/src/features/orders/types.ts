/** Mirrors what apps/backend returns from /orders. */

import {
  type CategoryListItem,
  type ComboListItem,
  isIngredient,
  type ProductListItem,
} from "@/features/products/types";
import { formatDate, formatDay, toDate, toDateInput } from "@/lib/date";
import {
  endsChain,
  legTakes,
  type PaymentLeg,
  visibleLegCount,
} from "@/lib/payment-legs";

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
  /** Money taken off this sale, or null when it was rung up at full price. */
  discount: string | null;
  id: string;
  items: OrderItemView[];
  paid: string;
  remaining: string;
  settledAt: string | null;
  total: string;
}

export interface MemberOrderDetail {
  member: {
    /** The short card number. Null for a member of staff — they have none. */
    code: string | null;
    id: string;
    name: string;
    phone: string | null;
  };
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
  /** Their own short code (`A02`) — what the desk says out loud. */
  code: string | null;
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
  /** Which group the tile lives behind on the till. Null means it lives loose. */
  categoryId: string | null;
  color: string | null;
  id: string;
  kind: "product" | "combo";
  name: string;
  price: string | null;
  productType: string | null;
}

/** A tile the desk has rung up, and how many of it. */
export interface CartLine {
  product: PosProduct;
  quantity: number;
}

/** A tile's price as a number. The wire carries a decimal string. */
export const priceOf = (product: PosProduct): number =>
  Number(product.price ?? 0);

/** A group of tiles on the till: its own tile until it is opened. */
export interface PosCategory {
  color: string | null;
  id: string;
  name: string;
}

/**
 * The categories the till groups by.
 *
 * Taken from `/categories` rather than from the distinct names on the products,
 * because a category owns a colour the desk chose for it and a product row only
 * carries the name. Empty ones are dropped by the grid, not here — which of them
 * has anything to show depends on the tab and the search.
 */
export const toPosCategories = (
  categories: readonly CategoryListItem[]
): PosCategory[] =>
  categories.map((category) => ({
    color: category.color,
    id: category.id,
    name: category.name,
  }));

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
      categoryId: product.categoryId,
      color: product.color,
      id: product.id,
      kind: "product" as const,
      name: product.name,
      price: product.price,
      productType: product.productType,
    })),
  ...combos.map((combo) => ({
    categoryId: combo.categoryId,
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

/** The part of the orders list another screen can hand over in a URL. */
export interface OrderSeed {
  filter: OrderFilter;
  q: string;
}

/**
 * What the orders list opens on when the URL says nothing.
 *
 * `unpaid` is the tab this screen has always started on; naming it here means
 * the dashboard's link to the unpaid list and the screen's own default cannot
 * drift apart.
 */
export const DEFAULT_ORDER_SEED: OrderSeed = { filter: "unpaid", q: "" };

/** The URL, filled back out into the controls' opening values. */
export const orderSeedFrom = (search: Partial<OrderSeed>): OrderSeed => ({
  filter: search.filter ?? DEFAULT_ORDER_SEED.filter,
  q: search.q ?? DEFAULT_ORDER_SEED.q,
});

/**
 * The date-range shortcuts. `any` clears both bounds.
 *
 * It is `any` rather than `all` because `OrderFilter` has an `"all"` too, and
 * the two sat forty lines apart in this file meaning different things — "all
 * statuses" and "all time". That identifier collision is what let the *copy*
 * collision happen: both rendered a button reading "Barchasi", one above the
 * other, and neither said which question it was answering.
 */
export const DATE_PRESETS = ["today", "week", "month", "year", "any"] as const;

export type DatePreset = (typeof DATE_PRESETS)[number];

/** A member owes money when their remaining balance is above zero. */
export const hasDebt = (value: string): boolean => Number(value) > 0;

/** `"YYYY-MM-DD"` from a Date, in local time — the value a date input holds. */
export { toDateInput } from "@/lib/date";

/**
 * The [from, to] a preset selects, as `"YYYY-MM-DD"` bounds the date inputs can
 * show and edit. Ranges are "the last week/month/year up to today", which is how
 * the desk reads them — everything since a point back from now.
 *
 * `any` falls to the default branch and clears both bounds, which is the same
 * thing "no date limit" has always meant here.
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

/**
 * Which preset a range **is**, rather than which one was last pressed.
 *
 * These used to be two pieces of state. `applyPreset` wrote both; editing a
 * bound by hand wrote the bound and reset the highlight to "all" — so the
 * toolbar lit "no date limit" while two limits were in force. Nothing reconciled
 * them because nothing could: they were two facts about one thing.
 *
 * Derived, that state is unrepresentable. The bounds are the only truth and the
 * highlight is read back off them, so a lit preset cannot disagree with the list
 * underneath it.
 *
 * `rangeForPreset` recomputes against *now* on every call, so a terminal left
 * open across midnight finds a stored "week" no longer matching the recomputed
 * week and falls back to spelling the two dates out. That is a stale truth
 * rather than a lie — the stored range genuinely is not "the last week" any more.
 */
export const presetOf = (from: string, to: string): DatePreset | "custom" => {
  for (const preset of DATE_PRESETS) {
    const range = rangeForPreset(preset);

    if (range.from === from && range.to === to) {
      return preset;
    }
  }

  return "custom";
};

/**
 * `"12 iyul"` — one end of a range, short enough to sit on a toolbar button.
 *
 * `formatDay` parses a bare `"2026-07-12"` field by field rather than through
 * `new Date(value)`, which would read it as UTC midnight and render the 11th
 * west of Greenwich. This string is what tells the operator which period the
 * list is showing, so it has to name the day that was picked.
 */
export const formatDayShort = formatDay;

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

/** `"6 iyul, 2026 01:20"` — the localised stamp shown on an order. */
export { formatDateTime } from "@/lib/date";

/** `"6 iyul, 2026"` — the day header a group of orders sits under. */
export const formatDayLabel = formatDate;

/** `"01:20"` — just the time, shown per order beneath its day header. */
export { formatTime } from "@/lib/date";

/** The calendar day of an ISO value, for grouping orders under one header. */
export const dayKeyOf = (value: string | null): string => {
  const parsed = toDate(value);

  return parsed ? toDateInput(parsed) : "unknown";
};

export const initialOf = (name: string): string =>
  name.trim().charAt(0).toUpperCase() || "?";
