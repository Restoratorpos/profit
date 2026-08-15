/** Mirrors the shapes apps/backend returns from /inventory and /suppliers. */

import type { Messages } from "@/lib/i18n/dictionary";

export const STOCK_STATUSES = ["in", "low", "out"] as const;

export type StockStatus = (typeof STOCK_STATUSES)[number];

/**
 * The stat tiles double as the status filter, and "total" is the tile meaning
 * no filter at all — so it belongs beside the three real statuses rather than
 * being spelled `StockStatus | "total"` at every use.
 */
export const STOCK_FILTERS = ["total", ...STOCK_STATUSES] as const;

export type StockFilter = (typeof STOCK_FILTERS)[number];

/**
 * How the stock table is ordered. `stock` is ascending, so it puts the empty
 * and nearly-empty shelves at the top — which is why the dashboard's low-stock
 * card links here with it rather than with a status filter: there is no single
 * status meaning "low *or* out", and a link that showed one and hid the other
 * would be a worse answer than the unfiltered list.
 */
export const STOCK_SORTS = ["name", "stock", "debt"] as const;

export type StockSort = (typeof STOCK_SORTS)[number];

/** The part of the stock screen another screen can hand over in a URL. */
export interface StockSeed {
  q: string;
  sort: StockSort;
  status: StockFilter;
}

/** What the stock screen opens on when the URL says nothing. */
export const DEFAULT_STOCK_SEED: StockSeed = {
  q: "",
  sort: "name",
  status: "total",
};

/**
 * The URL, filled back out into the controls' opening values.
 *
 * Each field is absent-able so a link carries only what it means — `?sort=stock`
 * rather than three parameters, two of which say "unchanged".
 */
export const stockSeedFrom = (search: Partial<StockSeed>): StockSeed => ({
  q: search.q ?? DEFAULT_STOCK_SEED.q,
  sort: search.sort ?? DEFAULT_STOCK_SEED.sort,
  status: search.status ?? DEFAULT_STOCK_SEED.status,
});

export interface InventoryItem {
  cost: string | null;
  id: string;
  name: string;
  price: string | null;
  productType: string | null;
  status: StockStatus;
  /** On hand. Signed: negative means more went out than was ever booked in. */
  stock: string;
  /** This product's share of what is still owed on the deliveries that brought it in. */
  supplierDebt: string;
  unit: string | null;
}

export interface MovementView {
  actionId: string | null;
  actionType: string | null;
  id: string;
  movementType: string | null;
  note: string | null;
  productId: string | null;
  productName: string | null;
  quantity: string;
  supplierName: string | null;
  time: string | null;
  unitCost: string | null;
  workerName: string | null;
}

export interface SupplierSummary {
  delivered: string;
  id: string;
  lastDeliveryAt: string | null;
  name: string;
  paid: string;
  passport: string | null;
  phone: string | null;
  remaining: string;
  supplierType: string | null;
}

/** The four documents the Amallar menu raises. `stocktake` posts to its own route. */
export const STOCK_ACTIONS = ["in", "writeoff", "return", "stocktake"] as const;

export type StockAction = (typeof STOCK_ACTIONS)[number];

export const PAYMENT_METHODS = ["cash", "card", "transfer"] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const QUANTITY_FORMAT = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 3,
});

/**
 * Stock reads as a plain number, not money: "1.65" and "40" rather than
 * "1.650". Trailing zeros on a shelf count are noise — the three decimals exist
 * for 250 g of coffee, not to be shown on every whole-unit row.
 */
export const formatQuantity = (value: string | number): string => {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? QUANTITY_FORMAT.format(parsed) : "—";
};

/** `"10000.00"` -> `"10,000 UZS"`. A dash for nothing, so a cell is never blank. */
/**
 * What to call a ledger row. The document type wins when there is one, because
 * it is the operator's own word for what they did; a bare sale falls back to the
 * movement type the POS wrote.
 *
 * `return` is deliberately two different labels: the POS writes it when a
 * customer hands goods back (stock up), and a supplier return writes
 * `supplier_return` (stock down). Same word, opposite direction — the history
 * screen has to be able to tell them apart.
 */
export const movementLabel = (
  movement: Pick<MovementView, "actionType" | "movementType">,
  messages: Messages
): string => {
  switch (movement.actionType ?? movement.movementType) {
    case "in":
      return messages["inventory.actionIn"];
    case "writeoff":
      return messages["inventory.actionWriteoff"];
    case "return":
    case "supplier_return":
      return messages["inventory.actionReturn"];
    case "stocktake":
      return messages["inventory.actionStocktake"];
    case "sale":
      return messages["inventory.movementSale"];
    default:
      return messages["inventory.movementCustomerReturn"];
  }
};

/** The label under each Amallar entry and at the top of the dialog it opens. */
export const actionLabel = (
  action: StockAction,
  messages: Messages
): string => {
  switch (action) {
    case "in":
      return messages["inventory.actionIn"];
    case "writeoff":
      return messages["inventory.actionWriteoff"];
    case "return":
      return messages["inventory.actionReturn"];
    default:
      return messages["inventory.actionStocktake"];
  }
};

export const dialogTitle = (
  action: StockAction,
  messages: Messages
): string => {
  switch (action) {
    case "in":
      return messages["inventory.dialogIn"];
    case "writeoff":
      return messages["inventory.dialogWriteoff"];
    case "return":
      return messages["inventory.dialogReturn"];
    default:
      return messages["inventory.dialogStocktake"];
  }
};

export const methodLabel = (
  method: PaymentMethod,
  messages: Messages
): string => {
  switch (method) {
    case "cash":
      return messages["inventory.methodCash"];
    case "card":
      return messages["inventory.methodCard"];
    default:
      return messages["inventory.methodTransfer"];
  }
};

/** How many products sit in each state, for the four tiles above the table. */
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

/** Profit per unit — the same figure the catalog shows, recomputed off stock. */
export const marginOf = (item: InventoryItem): number | null => {
  if (item.price === null || item.cost === null) {
    return null;
  }

  const price = Number(item.price);
  const cost = Number(item.cost);

  if (!(Number.isFinite(price) && Number.isFinite(cost))) {
    return null;
  }

  return price - cost;
};
