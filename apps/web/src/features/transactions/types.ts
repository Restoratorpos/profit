import {
  formatTime as formatClock,
  formatDay,
  NO_DATE,
  toDate,
} from "@/lib/date";
import type { Locale } from "@/lib/i18n/config";
import type { MessageKey } from "@/lib/i18n/dictionary";

/**
 * The cashbox screen. Mirrors apps/backend's `schemas/transaction.ts` — keep the
 * two lists identical or a category will render as a raw key.
 *
 * There is no cashboxes table: a cashbox **is** the payment method already
 * stored on every income and expense row, so a balance is what came in on that
 * method minus what went out on it. `transfer` is the bank — that is the value
 * `expenses.method` has always used, kept as the id and shown as "Bank".
 */
export const CASHBOXES = ["cash", "card", "transfer"] as const;

export type Cashbox = (typeof CASHBOXES)[number];

export const CASHBOX_LABEL: Record<Cashbox, MessageKey> = {
  card: "tx.cashboxCard",
  cash: "tx.cashboxCash",
  transfer: "tx.cashboxBank",
};

/**
 * A till reads as its instrument, so the tiles are told apart by shape as well
 * as position — the desk terminal is a cheap panel and three identical tiles
 * distinguished only by a word underneath is a slower read than it needs to be.
 */
export const CASHBOX_ICON: Record<Cashbox, "banknote" | "card" | "bank"> = {
  card: "card",
  cash: "banknote",
  transfer: "bank",
};

/*
 * `owner_deposit` is gone from what the desk can pick — see the same list in
 * apps/backend's `schemas/transaction.ts`. It stays in `CATEGORY_LABEL` below,
 * because rows written before it was withdrawn still have to render as a name
 * rather than a raw key.
 */
export const INCOME_CATEGORIES = [
  "membership",
  "goods",
  "hall_rent",
  "other",
] as const;

export type IncomeCategory = (typeof INCOME_CATEGORIES)[number];

export const EXPENSE_CATEGORIES = [
  "salary",
  "supplier",
  "owner_draw",
  "rent",
  "utilities",
  "repair",
  "equipment",
  "marketing",
  "household",
  "other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const TRANSFER_CATEGORY = "cash_move";

/**
 * Every category the ledger can show, including the ones this screen never
 * writes: `order` comes from a checkout on /orders, `sup_return` from a supplier
 * credit on /inventory, and `owner_deposit` from before it was withdrawn from
 * the picker. A row from elsewhere — or from earlier — still has to render with
 * a name rather than a key.
 */
export const CATEGORY_LABEL: Record<string, MessageKey> = {
  cash_move: "tx.catTransfer",
  equipment: "tx.catEquipment",
  goods: "tx.catGoodsSale",
  hall_rent: "tx.catHallRent",
  household: "tx.catHousehold",
  marketing: "tx.catMarketing",
  membership: "tx.catMembership",
  order: "tx.catOrder",
  other: "tx.catOther",
  owner_deposit: "tx.catOwnerDeposit",
  owner_draw: "tx.catOwnerDraw",
  reason: "tx.catOther",
  rent: "tx.catRent",
  repair: "tx.catRepair",
  salary: "tx.catSalary",
  sup_return: "tx.catSupplierReturn",
  supplier: "tx.catSupplier",
  utilities: "tx.catUtilities",
};

/** A category whose key is not in the map still has to read as something. */
export const labelForCategory = (category: string): MessageKey =>
  CATEGORY_LABEL[category] ?? "tx.catOther";

/**
 * Which extra picker the form shows once a category is chosen. Only two
 * categories name a counterparty, and only one of them requires it — a salary
 * with nobody attached is not auditable, a bag of cement bought from a market
 * stall genuinely has no supplier.
 */
export const categoryNeedsWorker = (category: string): boolean =>
  category === "salary";

export const categoryNeedsSupplier = (category: string): boolean =>
  category === "supplier";

export const categoryNeedsMember = (category: string): boolean =>
  category === "membership";

export interface TransactionRow {
  amount: string;
  cashbox: string | null;
  category: string;
  counterparty: string | null;
  counterpartyType: "member" | "supplier" | "worker" | null;
  id: string;
  /** False for rows /orders or /inventory own — those cannot be voided here. */
  isManual: boolean;
  isVoided: boolean;
  kind: "expense" | "income";
  note: string | null;
  occurredAt: string | null;
}

export type CashboxBalances = Record<Cashbox, string>;

export interface TransactionPage {
  balances: CashboxBalances;
  rows: TransactionRow[];
  /** Money in and out since midnight, across every till. */
  today: { expense: string; income: string };
}

/**
 * Money out, selected. The only filled control that needs a class of its own —
 * money in is the Button's `default` variant, the neon `--primary` with
 * near-black on it, and it is that in both modes.
 *
 * No `dark:` branch on either. Dark mode differs in exactly one place now, and
 * it is the value of `--destructive`, not a class here.
 */
export const ACTIVE_FILL_DANGER =
  "bg-destructive text-white hover:bg-destructive/90";

/** Which slice of the ledger the list is showing. Tiles and toggles set this. */
export interface LedgerFilter {
  /** Null is every till — the tiles toggle rather than force a choice. */
  cashbox: Cashbox | null;
  kind: "expense" | "income" | null;
}

export const DEFAULT_LEDGER_FILTER: LedgerFilter = {
  cashbox: null,
  kind: null,
};

export const LEDGER_KINDS = [
  { key: null, labelKey: "tx.filterAll" },
  { key: "income", labelKey: "tx.filterIncome" },
  { key: "expense", labelKey: "tx.filterExpense" },
] as const satisfies readonly {
  key: LedgerFilter["kind"];
  labelKey: MessageKey;
}[];

export interface PartyOption {
  id: string;
  name: string;
}

export interface TransactionParties {
  suppliers: PartyOption[];
  workers: PartyOption[];
}

/** Which form the desk is filling in. Tax payment is not a tab here. */
export const TX_TABS = ["expense", "income", "transfer"] as const;

export type TxTab = (typeof TX_TABS)[number];

export const DEFAULT_TX_TAB: TxTab = "expense";

/*
 * Typing an amount lives in `@/lib/money` now — `MoneyInput` groups the digits
 * and hands bare ones back, and every amount box in the product shares it. The
 * pair that used to live here grouped with `ru-RU` spaces while `formatMoney`
 * rendered `en-US` commas, so the ledger's own total disagreed with the box it
 * was typed into.
 */

const GROUP_FORMAT = new Intl.NumberFormat("ru-RU");

/** A signed figure for the ledger — the sign is the whole point of the row. */
export const formatSigned = (row: TransactionRow): string => {
  const amount = Number(row.amount);
  const magnitude = GROUP_FORMAT.format(Number.isFinite(amount) ? amount : 0);

  return row.kind === "income" ? `+${magnitude}` : `−${magnitude}`;
};

export const formatBalance = (value: string): string => {
  const amount = Number(value);

  return GROUP_FORMAT.format(Number.isFinite(amount) ? amount : 0);
};

/**
 * Ledger rows show the clock, not the date — the list is today's work. A row
 * from another day says which day, in words: `"31 iyul 18:03"`.
 */
export const formatTime = (value: string | null, locale: Locale): string => {
  const parsed = toDate(value);

  if (!parsed) {
    return NO_DATE;
  }

  const now = new Date();
  const isToday =
    parsed.getFullYear() === now.getFullYear() &&
    parsed.getMonth() === now.getMonth() &&
    parsed.getDate() === now.getDate();

  const time = formatClock(parsed);

  return isToday ? time : `${formatDay(parsed, locale)} ${time}`;
};
