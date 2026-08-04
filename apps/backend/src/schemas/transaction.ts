import { z } from "zod";

/**
 * The cashbox screen: money in, money out, and moving it between the tills.
 *
 * There is no `cashboxes` table. A "cashbox" here **is** the payment method
 * already stored on every row — `income.payment_type` and `expenses.method` —
 * so a balance is simply what came in on that method minus what went out on it,
 * and every row this database already holds is counted without a migration.
 */

/**
 * The three tills. These are the literal column values, not labels mapped onto
 * them: `transfer` is what `expenses.method` has always called a bank transfer,
 * so it is kept as the id and shown as "Bank". Renaming it would orphan every
 * supplier payment already recorded that way.
 *
 * `debt` and `free` are deliberately absent. Both describe a sale where no money
 * moved, so neither is a till and neither can hold a balance.
 */
export const CASHBOXES = ["cash", "card", "transfer"] as const;

export type Cashbox = (typeof CASHBOXES)[number];

/**
 * Money in, typed at the desk.
 *
 * `membership` and `order` are also written automatically — by a plan sale on
 * /members and by a checkout on /orders. Typing a `membership` row here is the
 * custom case: a price that is not a plan's price, a day pass, a part payment
 * taken outside the sale flow.
 */
/*
 * `owner_deposit` — the owner putting capital **in** — was here and is not any
 * more: the desk does not book the owner's own money, and offering it at the
 * front counter only invited a takings figure that was not takings.
 *
 * Removing it from this list stops new ones being written. It deliberately does
 * **not** remove the category: rows already carrying it stay readable, keep
 * their label (`CATEGORY_LABEL` on the web side), and — the part that matters —
 * stay excluded from revenue by `NON_REVENUE_INCOME` in dashboard.service.ts.
 * Dropping it from there instead would rewrite history, turning every past
 * deposit into a day's trading.
 */
export const INCOME_CATEGORIES = [
  /** A'zolik — a membership payment entered by hand. */
  "membership",
  /** A sale that did not go through the till: kit, an old treadmill, a locker. */
  "goods",
  /** The hall or a room let out to somebody else. */
  "hall_rent",
  "other",
] as const;

export type IncomeCategory = (typeof INCOME_CATEGORIES)[number];

/**
 * Money out.
 *
 * `supplier` is shared with /inventory, which writes it when a delivery is paid
 * for. Entering one here is the delivery-less case — cash handed over for goods
 * nobody raised a document for.
 */
export const EXPENSE_CATEGORIES = [
  /** Oylik. Requires a worker: an unattributed salary is not auditable. */
  "salary",
  /** Goods bought in. A supplier is optional — plenty are bought from nobody. */
  "supplier",
  /** The owner taking money **out** of the business — an owner's draw. */
  "owner_draw",
  "rent",
  "utilities",
  "repair",
  "equipment",
  "marketing",
  /** Xo'jalik: cleaning, towels, water, the small things that keep a gym open. */
  "household",
  "other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/**
 * Written on **both** sides of a cashbox-to-cashbox move.
 *
 * Distinct from the `transfer` cashbox id on purpose: this is the `category`
 * column, that is the `method` column, and a query confusing the two would
 * silently return the wrong set. Moving cash to the bank is
 * `category = "cash_move"`, `method = "cash"` out and `payment_type = "transfer"`
 * in — the category says what happened, the method says which till.
 */
export const TRANSFER_CATEGORY = "cash_move";

/**
 * Categories this screen may void. Everything else in the ledger is the tail of
 * a document somebody else owns — an order, a delivery — and voiding the money
 * without the document it settles would leave that document looking unpaid.
 * Those rows are reversed where they were raised, not here.
 */
export const MANUAL_INCOME_CATEGORIES: readonly string[] = [
  ...INCOME_CATEGORIES,
  /*
   * Withdrawn from the picker above, but still listed here on purpose. What may
   * be *created* and what may be *cancelled* are not the same question: rows
   * already carrying this were written by this screen and there is no document
   * elsewhere to reverse them from, so dropping it here would make every past
   * owner deposit permanent — including a mistyped one.
   */
  "owner_deposit",
  TRANSFER_CATEGORY,
];

export const MANUAL_EXPENSE_CATEGORIES: readonly string[] = [
  ...EXPENSE_CATEGORIES,
  TRANSFER_CATEGORY,
];

/**
 * Amounts are decimal(14,2) in both tables. Taken as a number and handed on as a
 * fixed string, so a float never reaches the column.
 */
const money = z.coerce
  .number()
  .positive("Must be greater than zero")
  .max(999_999_999_999.99, "Too large for the column")
  .transform((value) => value.toFixed(2));

const note = z.string().trim().max(255).nullish();

const optionalId = z.string().trim().min(1).max(64).nullish();

export const createIncomeSchema = z.object({
  amount: money,
  branchId: z.string().trim().max(20).nullish(),
  cashbox: z.enum(CASHBOXES),
  category: z.enum(INCOME_CATEGORIES),
  /** Only meaningful on `membership`; ignored elsewhere. */
  memberId: optionalId,
  note,
  /**
   * Backdating a payment. Absent means now — which is the overwhelming case, so
   * the desk never has to touch it.
   */
  occurredAt: z.coerce.date().optional(),
});

export type CreateIncomeInput = z.infer<typeof createIncomeSchema>;

export const createExpenseSchema = z
  .object({
    amount: money,
    branchId: z.string().trim().max(20).nullish(),
    cashbox: z.enum(CASHBOXES),
    category: z.enum(EXPENSE_CATEGORIES),
    note,
    occurredAt: z.coerce.date().optional(),
    /** Only meaningful on `supplier`; "suppliersiz" is simply leaving it out. */
    supplierId: optionalId,
    /** Required on `salary` — see the refinement below. */
    workerId: optionalId,
  })
  .refine((input) => input.category !== "salary" || Boolean(input.workerId), {
    message: "Pick the worker this salary is for",
    path: ["workerId"],
  });

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

export const createTransferSchema = z
  .object({
    amount: money,
    branchId: z.string().trim().max(20).nullish(),
    from: z.enum(CASHBOXES),
    note,
    occurredAt: z.coerce.date().optional(),
    to: z.enum(CASHBOXES),
  })
  .refine((input) => input.from !== input.to, {
    message: "Pick two different cashboxes",
    path: ["to"],
  });

export type CreateTransferInput = z.infer<typeof createTransferSchema>;

export const transactionQuerySchema = z.object({
  cashbox: z.enum(CASHBOXES).optional(),
  /** Blank means every category. */
  category: z.string().trim().max(16).optional(),
  kind: z.enum(["income", "expense"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type TransactionQuery = z.infer<typeof transactionQuerySchema>;
