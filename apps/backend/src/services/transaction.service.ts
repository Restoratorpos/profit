import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db/index.js";
import {
  expenses,
  ID_LENGTH,
  income,
  members,
  suppliers,
  workers,
} from "../db/schema.js";
import {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
} from "../lib/errors.js";
import { SALARY_CATEGORY, salaryPeriodOf } from "../lib/payroll.js";
import {
  CASHBOXES,
  type Cashbox,
  type CreateExpenseInput,
  type CreateIncomeInput,
  type CreateTransferInput,
  MANUAL_EXPENSE_CATEGORIES,
  MANUAL_INCOME_CATEGORIES,
  TRANSFER_CATEGORY,
  type TransactionQuery,
} from "../schemas/transaction.js";

/**
 * The cashbox ledger.
 *
 * Two rules shape this file, and both are inherited rather than invented:
 *
 * 1. **Nothing is stored as a balance.** A cashbox's balance is
 *    `SUM(income.amount) - SUM(expenses.amount)` over rows carrying that method,
 *    computed on read. There is no column to keep in step and nothing to drift
 *    out of agreement with /orders or /inventory.
 * 2. **Voiding, never deleting.** Both tables carry `voided_at`, so every sum
 *    here filters `voided_at IS NULL`. A deleted row would silently rewrite
 *    yesterday's takings.
 */

/** A row of either table, flattened into one thing the desk can read. */
export interface TransactionRow {
  amount: string;
  /** `income.payment_type` / `expenses.method`. Null on pre-existing odd rows. */
  cashbox: string | null;
  category: string;
  /** Member, worker or supplier name — whoever the money came from or went to. */
  counterparty: string | null;
  counterpartyType: "member" | "supplier" | "worker" | null;
  /** `"income:41"` — the two tables have separate autoincrements, so the kind
   * has to be part of the identity or row 41 is ambiguous. */
  id: string;
  /** False for rows another screen owns; those cannot be voided from here. */
  isManual: boolean;
  isVoided: boolean;
  kind: "expense" | "income";
  note: string | null;
  occurredAt: string | null;
}

export type CashboxBalances = Record<Cashbox, string>;

const isCashbox = (value: string | null): value is Cashbox =>
  value !== null && (CASHBOXES as readonly string[]).includes(value);

const toAmount = (value: number): string => value.toFixed(2);

/**
 * One `GROUP BY method` bucket, from either table. `today` is the same sum
 * narrowed to rows since midnight — carried on the same bucket rather than
 * fetched separately, because it is the identical scan with one more `CASE`.
 */
export interface CashboxTotal {
  cashbox: string | null;
  today: string | null;
  total: string | null;
}

/** What the tiles at the top of the screen read. */
export interface CashboxSummary {
  balances: CashboxBalances;
  /** Money in and out since midnight, across every till — the shift's takings. */
  today: { expense: string; income: string };
}

/**
 * What each till holds, given what came in and what went out on each method.
 *
 * Pure, and exported for that reason: this is the one calculation on the screen
 * that quietly gets money wrong, so it is tested for real rather than through a
 * mock. Buckets whose method is not one of the three tills — `debt`, `free`, a
 * supplier `return` credit — are dropped: no money moved, so no balance can be
 * affected by them, and none of it belongs in today's takings either.
 */
export const summariseCashboxes = (
  received: readonly CashboxTotal[],
  paid: readonly CashboxTotal[]
): CashboxSummary => {
  const totals = new Map<Cashbox, number>(CASHBOXES.map((box) => [box, 0]));
  let todayIn = 0;
  let todayOut = 0;

  for (const row of received) {
    if (isCashbox(row.cashbox)) {
      totals.set(
        row.cashbox,
        (totals.get(row.cashbox) ?? 0) + Number(row.total ?? 0)
      );
      todayIn += Number(row.today ?? 0);
    }
  }

  for (const row of paid) {
    if (isCashbox(row.cashbox)) {
      totals.set(
        row.cashbox,
        (totals.get(row.cashbox) ?? 0) - Number(row.total ?? 0)
      );
      todayOut += Number(row.today ?? 0);
    }
  }

  return {
    balances: {
      card: toAmount(totals.get("card") ?? 0),
      cash: toAmount(totals.get("cash") ?? 0),
      transfer: toAmount(totals.get("transfer") ?? 0),
    },
    today: { expense: toAmount(todayOut), income: toAmount(todayIn) },
  };
};

/** Midnight local to the server, which is where the desk's day starts. */
const startOfToday = (): Date => {
  const now = new Date();

  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

/**
 * What each till holds, over the whole gym. Two aggregate queries rather than a
 * row-by-row sweep, and they are independent — so they start together.
 */
export const getCashboxSummary = async (
  gymId: string
): Promise<CashboxSummary> => {
  const midnight = startOfToday();

  const inPromise = db
    .select({
      cashbox: income.paymentType,
      today: sql<
        string | null
      >`SUM(CASE WHEN ${income.paidAt} >= ${midnight} THEN ${income.amount} ELSE 0 END)`,
      total: sql<string | null>`SUM(${income.amount})`,
    })
    .from(income)
    .where(and(eq(income.gymId, gymId), isNull(income.voidedAt)))
    .groupBy(income.paymentType);

  const outPromise = db
    .select({
      cashbox: expenses.method,
      today: sql<
        string | null
      >`SUM(CASE WHEN ${expenses.paidAt} >= ${midnight} THEN ${expenses.amount} ELSE 0 END)`,
      total: sql<string | null>`SUM(${expenses.amount})`,
    })
    .from(expenses)
    .where(and(eq(expenses.gymId, gymId), isNull(expenses.voidedAt)))
    .groupBy(expenses.method);

  const [received, paid] = await Promise.all([inPromise, outPromise]);

  return summariseCashboxes(received, paid);
};

const toIso = (value: Date | null): string | null =>
  value === null ? null : value.toISOString();

/** Money in, already narrowed to the gym and whatever the query asked for. */
const selectIncomeRows = (gymId: string, query: TransactionQuery) =>
  db
    .select({
      amount: income.amount,
      cashbox: income.paymentType,
      category: income.category,
      counterparty: members.fullname,
      id: income.transactionId,
      memberId: income.memberId,
      note: income.note,
      occurredAt: income.paidAt,
      targetId: income.targetId,
      voidedAt: income.voidedAt,
    })
    .from(income)
    .leftJoin(members, eq(members.memberId, income.memberId))
    .where(
      and(
        eq(income.gymId, gymId),
        query.cashbox ? eq(income.paymentType, query.cashbox) : undefined,
        query.category ? eq(income.category, query.category) : undefined
      )
    )
    .orderBy(desc(income.paidAt), desc(income.transactionId))
    .limit(query.limit);

const selectExpenseRows = (gymId: string, query: TransactionQuery) =>
  db
    .select({
      amount: expenses.amount,
      actionId: expenses.actionId,
      cashbox: expenses.method,
      category: expenses.category,
      id: expenses.id,
      note: expenses.note,
      occurredAt: expenses.paidAt,
      supplier: suppliers.supplier,
      supplierId: expenses.supplierId,
      voidedAt: expenses.voidedAt,
      worker: workers.fullname,
      workerId: expenses.workerId,
    })
    .from(expenses)
    .leftJoin(workers, eq(workers.workerId, expenses.workerId))
    .leftJoin(suppliers, eq(suppliers.supplierId, expenses.supplierId))
    .where(
      and(
        eq(expenses.gymId, gymId),
        query.cashbox ? eq(expenses.method, query.cashbox) : undefined,
        query.category ? eq(expenses.category, query.category) : undefined
      )
    )
    .orderBy(desc(expenses.paidAt), desc(expenses.id))
    .limit(query.limit);

/**
 * Whether this screen may void the row.
 *
 * The category alone is not enough, because two screens write the same one. A
 * plan sale on /members writes `category = "membership"` with `target_id` set to
 * the membership it paid for; a payment typed here writes the same category with
 * `target_id` null. Cancelling the first without cancelling the membership would
 * leave that membership looking unpaid forever — so a linked row is refused and
 * reversed where it was raised.
 *
 * A transfer is the exception: both its halves carry a linking id by design, and
 * this screen is where they were written.
 */
export const isManualRow = (
  category: string,
  linkId: string | null,
  manualCategories: readonly string[]
): boolean => {
  if (!manualCategories.includes(category)) {
    return false;
  }

  return category === TRANSFER_CATEGORY || linkId === null;
};

/**
 * What an expense's `action_id` links it to, for the rule above.
 *
 * A salary paid from the staff screen carries the month it settles there rather
 * than a link to a document (see `lib/payroll.ts`), and there is no such
 * document to cancel it from — so it reads as unlinked and stays voidable here,
 * exactly like a wage typed on this screen.
 */
const expenseLinkOf = (category: string, actionId: string | null) =>
  category === SALARY_CATEGORY && salaryPeriodOf(actionId) !== null
    ? null
    : actionId;

interface Counterparty {
  name: string | null;
  type: TransactionRow["counterpartyType"];
}

/**
 * Who the money went to. A row can only carry one payee, and the worker is
 * checked first because a salary always names one — a supplier id on the same
 * row would be leftover data, not a second recipient.
 */
const payeeOf = (row: {
  supplier: string | null;
  supplierId: string | null;
  worker: string | null;
  workerId: string | null;
}): Counterparty => {
  if (row.workerId) {
    return { name: row.worker, type: "worker" };
  }

  if (row.supplierId) {
    return { name: row.supplier, type: "supplier" };
  }

  return { name: null, type: null };
};

/**
 * A null `paid_at` sorts last rather than first. Rows predating this screen can
 * have one, and floating them to the top would bury today's takings under
 * whatever the import left behind.
 */
const byNewestFirst = (left: TransactionRow, right: TransactionRow): number => {
  if (left.occurredAt === right.occurredAt) {
    return 0;
  }

  if (left.occurredAt === null) {
    return 1;
  }

  if (right.occurredAt === null) {
    return -1;
  }

  return left.occurredAt < right.occurredAt ? 1 : -1;
};

/**
 * The ledger, newest first.
 *
 * Read as two queries and merged in memory rather than as a SQL `UNION`. The
 * two tables carry different columns — `member_id` on one side, `worker_id` and
 * `supplier_id` on the other — so a union would mean padding both halves with
 * nulls to a shape neither table has, and the counterparty join would have to be
 * written twice anyway. `limit` is applied to each half before the merge, so the
 * merged list is at most `2 × limit` rows before it is trimmed back down.
 *
 * Both halves are started before either is awaited: neither depends on the other.
 */
export const listTransactions = async (
  gymId: string,
  query: TransactionQuery
): Promise<TransactionRow[]> => {
  const incomePromise =
    query.kind === "expense"
      ? Promise.resolve([])
      : selectIncomeRows(gymId, query);

  const expensePromise =
    query.kind === "income"
      ? Promise.resolve([])
      : selectExpenseRows(gymId, query);

  const [incomeRows, expenseRows] = await Promise.all([
    incomePromise,
    expensePromise,
  ]);

  const rows: TransactionRow[] = [];

  for (const row of incomeRows) {
    rows.push({
      amount: row.amount ?? "0.00",
      cashbox: row.cashbox,
      category: row.category ?? "other",
      counterparty: row.memberId ? row.counterparty : null,
      counterpartyType: row.memberId ? "member" : null,
      id: `income:${row.id}`,
      isManual: isManualRow(
        row.category ?? "",
        row.targetId,
        MANUAL_INCOME_CATEGORIES
      ),
      isVoided: row.voidedAt !== null,
      kind: "income",
      note: row.note,
      occurredAt: toIso(row.occurredAt),
    });
  }

  for (const row of expenseRows) {
    const payee = payeeOf(row);

    rows.push({
      amount: row.amount ?? "0.00",
      cashbox: row.cashbox,
      category: row.category,
      counterparty: payee.name,
      counterpartyType: payee.type,
      id: `expense:${row.id}`,
      isManual: isManualRow(
        row.category,
        expenseLinkOf(row.category, row.actionId),
        MANUAL_EXPENSE_CATEGORIES
      ),
      isVoided: row.voidedAt !== null,
      kind: "expense",
      note: row.note,
      occurredAt: toIso(row.occurredAt),
    });
  }

  rows.sort(byNewestFirst);

  return rows.slice(0, query.limit);
};

const assertWorker = async (gymId: string, workerId: string): Promise<void> => {
  const [row] = await db
    .select({ id: workers.workerId })
    .from(workers)
    .where(and(eq(workers.gymId, gymId), eq(workers.workerId, workerId)))
    .limit(1);

  if (!row) {
    throw new NotFoundError("Worker not found");
  }
};

const assertSupplier = async (
  gymId: string,
  supplierId: string
): Promise<void> => {
  const [row] = await db
    .select({ id: suppliers.supplierId })
    .from(suppliers)
    .where(
      and(eq(suppliers.gymId, gymId), eq(suppliers.supplierId, supplierId))
    )
    .limit(1);

  if (!row) {
    throw new NotFoundError("Supplier not found");
  }
};

const assertMember = async (gymId: string, memberId: string): Promise<void> => {
  const [row] = await db
    .select({ id: members.memberId })
    .from(members)
    .where(and(eq(members.gymId, gymId), eq(members.memberId, memberId)))
    .limit(1);

  if (!row) {
    throw new NotFoundError("Member not found");
  }
};

/**
 * Money in, typed at the desk.
 *
 * `member_id` is only kept for a `membership` row. Attaching a member to a hall
 * rental or the owner's own deposit would put that money on their card as if
 * they had paid it, which is what the member debt columns read.
 */
export const createIncomeEntry = async (
  gymId: string,
  input: CreateIncomeInput,
  workerId: string | null
): Promise<void> => {
  if (!workerId) {
    throw new UnauthorizedError("Missing x-worker-id");
  }

  const memberId =
    input.category === "membership" ? (input.memberId ?? null) : null;

  if (memberId) {
    await assertMember(gymId, memberId);
  }

  await db.insert(income).values({
    amount: input.amount,
    branchId: input.branchId ?? null,
    category: input.category,
    createdBy: workerId,
    gymId,
    memberId,
    note: input.note ?? null,
    paidAt: input.occurredAt ?? new Date(),
    paymentType: input.cashbox,
    targetId: null,
    voidedAt: null,
    voidedBy: null,
  });
};

/**
 * Money out.
 *
 * A `supplier` expense written here deliberately carries **no** `action_id`. The
 * column ties a payment to the delivery it settles, and /inventory reads it to
 * work out what is still owed on that delivery — so pointing a hand-typed row at
 * a document it was not paying for would mark that delivery settled.
 */
export const createExpenseEntry = async (
  gymId: string,
  input: CreateExpenseInput,
  workerId: string | null
): Promise<void> => {
  if (!workerId) {
    throw new UnauthorizedError("Missing x-worker-id");
  }

  const payee = input.category === "salary" ? (input.workerId ?? null) : null;
  const supplierId =
    input.category === "supplier" ? (input.supplierId ?? null) : null;

  if (payee) {
    await assertWorker(gymId, payee);
  }

  if (supplierId) {
    await assertSupplier(gymId, supplierId);
  }

  await db.insert(expenses).values({
    actionId: null,
    amount: input.amount,
    branchId: input.branchId ?? null,
    category: input.category,
    createdBy: workerId,
    gymId,
    method: input.cashbox,
    note: input.note ?? null,
    paidAt: input.occurredAt ?? new Date(),
    supplierId,
    voidedAt: null,
    voidedBy: null,
    workerId: payee,
  });
};

/**
 * Moving money between two tills — cash banked, card takings drawn down.
 *
 * Written as a matched pair in one transaction: an expense leaving the source
 * and an income arriving at the target. Nothing is created or destroyed, so the
 * two must never exist apart — half a transfer is money that has vanished.
 *
 * Both rows carry the same minted id, in `expenses.action_id` and
 * `income.target_id`, so voiding one can find and void the other.
 */
export const createTransfer = async (
  gymId: string,
  input: CreateTransferInput,
  workerId: string | null
): Promise<void> => {
  if (!workerId) {
    throw new UnauthorizedError("Missing x-worker-id");
  }

  const moveId = nanoid(ID_LENGTH);
  const now = input.occurredAt ?? new Date();
  const branchId = input.branchId ?? null;

  await db.transaction(async (tx) => {
    await tx.insert(expenses).values({
      actionId: moveId,
      amount: input.amount,
      branchId,
      category: TRANSFER_CATEGORY,
      createdBy: workerId,
      gymId,
      method: input.from,
      note: input.note ?? null,
      paidAt: now,
      supplierId: null,
      voidedAt: null,
      voidedBy: null,
      workerId: null,
    });

    await tx.insert(income).values({
      amount: input.amount,
      branchId,
      category: TRANSFER_CATEGORY,
      createdBy: workerId,
      gymId,
      memberId: null,
      note: input.note ?? null,
      paidAt: now,
      paymentType: input.to,
      targetId: moveId,
      voidedAt: null,
      voidedBy: null,
    });
  });
};

const parseRowId = (
  id: string
): { kind: "expense" | "income"; key: string } => {
  const [kind, key] = id.split(":");

  if ((kind !== "income" && kind !== "expense") || !key) {
    throw new BadRequestError("Malformed transaction id");
  }

  return { kind, key };
};

/**
 * Voids a row this screen owns, and the other half of a transfer with it.
 *
 * Rows written by /orders, /members or /inventory are refused: the money there
 * is the tail of a document, and cancelling the payment without the document
 * would leave a settled order looking unpaid. Those are reversed where they were
 * raised.
 */
export const voidTransaction = async (
  gymId: string,
  id: string,
  workerId: string | null
): Promise<void> => {
  if (!workerId) {
    throw new UnauthorizedError("Missing x-worker-id");
  }

  const { kind, key } = parseRowId(id);
  const rowId = Number(key);

  if (!Number.isInteger(rowId)) {
    throw new BadRequestError("Malformed transaction id");
  }

  const now = new Date();

  if (kind === "income") {
    const [row] = await db
      .select({ category: income.category, targetId: income.targetId })
      .from(income)
      .where(and(eq(income.gymId, gymId), eq(income.transactionId, rowId)))
      .limit(1);

    if (!row) {
      throw new NotFoundError("Transaction not found");
    }

    if (
      !isManualRow(row.category ?? "", row.targetId, MANUAL_INCOME_CATEGORIES)
    ) {
      throw new BadRequestError(
        "This payment belongs to a sale — cancel it where it was taken"
      );
    }

    await db.transaction(async (tx) => {
      await tx
        .update(income)
        .set({ voidedAt: now, voidedBy: workerId })
        .where(and(eq(income.gymId, gymId), eq(income.transactionId, rowId)));

      if (row.category === TRANSFER_CATEGORY && row.targetId) {
        await tx
          .update(expenses)
          .set({ voidedAt: now, voidedBy: workerId })
          .where(
            and(eq(expenses.gymId, gymId), eq(expenses.actionId, row.targetId))
          );
      }
    });

    return;
  }

  const [row] = await db
    .select({ actionId: expenses.actionId, category: expenses.category })
    .from(expenses)
    .where(and(eq(expenses.gymId, gymId), eq(expenses.id, rowId)))
    .limit(1);

  if (!row) {
    throw new NotFoundError("Transaction not found");
  }

  /*
   * A `supplier` expense is in the manual set, but only the ones typed here carry
   * no `action_id`. One raised against a delivery is that delivery's payment, and
   * voiding it from this screen would reopen a balance /inventory is tracking.
   */
  if (
    !isManualRow(
      row.category,
      expenseLinkOf(row.category, row.actionId),
      MANUAL_EXPENSE_CATEGORIES
    )
  ) {
    throw new BadRequestError(
      "This payment belongs to a delivery — cancel it on the stock screen"
    );
  }

  await db.transaction(async (tx) => {
    await tx
      .update(expenses)
      .set({ voidedAt: now, voidedBy: workerId })
      .where(and(eq(expenses.gymId, gymId), eq(expenses.id, rowId)));

    if (row.category === TRANSFER_CATEGORY && row.actionId) {
      await tx
        .update(income)
        .set({ voidedAt: now, voidedBy: workerId })
        .where(and(eq(income.gymId, gymId), eq(income.targetId, row.actionId)));
    }
  });
};

/** Everything the transactions screen opens on, in one round trip. */
export interface TransactionPage {
  balances: CashboxBalances;
  rows: TransactionRow[];
  today: CashboxSummary["today"];
}

/**
 * The tiles summarise the **whole** ledger regardless of what the list is
 * filtered to. A balance that moved every time the operator changed the list
 * filter would look like money appearing and vanishing.
 */
export const loadTransactionPage = async (
  gymId: string,
  query: TransactionQuery
): Promise<TransactionPage> => {
  const [summary, rows] = await Promise.all([
    getCashboxSummary(gymId),
    listTransactions(gymId, query),
  ]);

  return { balances: summary.balances, rows, today: summary.today };
};

/** The two pickers the form needs — workers for a salary, suppliers for goods. */
export interface TransactionParties {
  suppliers: { id: string; name: string }[];
  workers: { id: string; name: string }[];
}

export const listTransactionParties = async (
  gymId: string
): Promise<TransactionParties> => {
  const workerPromise = db
    .select({ id: workers.workerId, name: workers.fullname })
    .from(workers)
    .where(and(eq(workers.gymId, gymId), inArray(workers.status, ["active"])));

  const supplierPromise = db
    .select({ id: suppliers.supplierId, name: suppliers.supplier })
    .from(suppliers)
    .where(eq(suppliers.gymId, gymId));

  const [staff, vendors] = await Promise.all([workerPromise, supplierPromise]);

  return {
    suppliers: vendors.map((row) => ({ id: row.id, name: row.name ?? "—" })),
    workers: staff.map((row) => ({ id: row.id, name: row.name ?? "—" })),
  };
};
