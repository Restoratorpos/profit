import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db/index.js";
import {
  branches,
  expenses,
  ID_LENGTH,
  products,
  SHORT_ID_LENGTH,
  storageActionsMain,
  storageActionsRep,
  suppliers,
  workers,
} from "../db/schema.js";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from "../lib/errors.js";
import type {
  CreateStockActionInput,
  CreateStocktakeInput,
  CreateSupplierInput,
  MovementQuery,
  PaySupplierInput,
  UpdateSupplierInput,
} from "../schemas/inventory.js";

/**
 * Stock and the money owed for it. Every query filters by `gymId` — the database
 * declares no tenant constraints, so an unscoped query here is a data leak.
 *
 * Two rules shape this whole file:
 *
 * 1. **Stock is never stored, only summed.** On-hand for a product is
 *    `SUM(storage_actions_rep.quantity)` over rows whose document is not voided.
 *    There is no column to keep in step and nothing to drift.
 * 2. **Debt is never stored either.** What is owed on a delivery is its
 *    `total_price` minus the `expenses` rows pointing at its `action_id`.
 */

/** Below this, a product is "Kam qoldi" rather than "Mavjud". */
export const LOW_STOCK_THRESHOLD = 5;

/** `expenses.category` for money paid to a supplier, and for a credit note. */
const SUPPLIER_EXPENSE = "supplier";
const SUPPLIER_CREDIT = "sup_return";

/**
 * A supplier return is a *credit*, not cash — it pays a delivery down without
 * anything leaving the till, and `method` is what says so on the row.
 */
const RETURN_METHOD = "return";

/**
 * What the ledger calls each movement. The POS already writes `sale` and
 * `return`, where `return` means a customer handing goods back — stock going
 * **up**. Sending goods back to a supplier is the opposite direction with the
 * opposite counterparty, so it gets its own name rather than overloading that
 * one and making the history screen unable to tell them apart.
 */
const MOVEMENT_TYPE = {
  in: "in",
  return: "supplier_return",
  stocktake: "stocktake",
  writeoff: "writeoff",
} as const;

export type StockStatus = "in" | "low" | "out";

/** One row of the Inventar table. */
export interface InventoryItem {
  /** What one unit costs us — the product's own cost, not a delivery's. */
  cost: string | null;
  id: string;
  name: string;
  price: string | null;
  productType: string | null;
  status: StockStatus;
  /** On hand: the signed sum of every live movement. May be negative. */
  stock: string;
  /** This product's share of what is still owed on the deliveries that brought it in. */
  supplierDebt: string;
  unit: string | null;
}

export interface MovementView {
  actionId: string | null;
  /** The document type when there is a document; null for a bare sale. */
  actionType: string | null;
  id: string;
  movementType: string | null;
  note: string | null;
  productId: string | null;
  productName: string | null;
  /** Signed: `+` put it on the shelf, `−` took it off. */
  quantity: string;
  supplierName: string | null;
  time: string | null;
  unitCost: string | null;
  workerName: string | null;
}

export interface SupplierSummary {
  /** Deliveries taken from them, ever, at document value. */
  delivered: string;
  id: string;
  lastDeliveryAt: string | null;
  name: string;
  /** Paid plus credited back. */
  paid: string;
  passport: string | null;
  phone: string | null;
  /** Still owed: delivered − paid, floored at zero. */
  remaining: string;
  supplierType: string | null;
}

const toIsoDate = (value: Date | string | null): string | null => {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : String(value);
};

const toMoney = (value: number): string => value.toFixed(2);

const toQuantity = (value: number): string => value.toFixed(3);

/** MySQL returns DECIMAL as a string; SUM() of nothing comes back null. */
const toNumber = (value: string | number | null): number => {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Nothing on the shelf is `out` even when the number is negative — a negative
 * total means more was sold than was ever booked in, which is still "there is
 * none", and the count the desk needs to act on is the same either way.
 */
export const stockStatusOf = (stock: number): StockStatus => {
  if (stock <= 0) {
    return "out";
  }

  return stock < LOW_STOCK_THRESHOLD ? "low" : "in";
};

/** One product's worth of a delivery, at what that delivery paid for it. */
export interface DeliveryLine {
  actionId: string;
  productId: string;
  value: number;
}

/**
 * Splits what is still owed on each delivery across the products it brought in,
 * by line value. Pure, and separate from the queries that feed it, because this
 * is the one calculation on this screen that is worth being sure about: summed
 * over every product it must equal the total owed to every supplier.
 *
 * A delivery whose lines are worth nothing between them — a free crate, or costs
 * left blank — is split evenly instead. The alternative is money quietly
 * dropping out of the column because it could not be attributed.
 */
export const spreadDeliveryDebt = (
  deliveries: readonly { id: string; remaining: number }[],
  lines: readonly DeliveryLine[]
): Map<string, number> => {
  const debt = new Map<string, number>();
  const byAction = new Map<string, DeliveryLine[]>();

  for (const line of lines) {
    const existing = byAction.get(line.actionId);

    if (existing) {
      existing.push(line);
    } else {
      byAction.set(line.actionId, [line]);
    }
  }

  for (const delivery of deliveries) {
    const deliveryLines = byAction.get(delivery.id);

    if (delivery.remaining <= 0 || !deliveryLines?.length) {
      continue;
    }

    const base = deliveryLines.reduce((sum, line) => sum + line.value, 0);

    for (const line of deliveryLines) {
      const share = base > 0 ? line.value / base : 1 / deliveryLines.length;

      debt.set(
        line.productId,
        (debt.get(line.productId) ?? 0) + delivery.remaining * share
      );
    }
  }

  return debt;
};

/**
 * A voided document's ledger rows must stop counting, and a sale has no document
 * at all. Both fall out of one left join: `is_deleted` is NULL when there is no
 * header, and NULL or 0 when the header stands.
 */
const isLiveMovement = or(
  isNull(storageActionsMain.isDeleted),
  eq(storageActionsMain.isDeleted, false)
);

const notDeleted = or(
  isNull(storageActionsMain.isDeleted),
  eq(storageActionsMain.isDeleted, false)
);

/**
 * The branch to file this under. A worker's own branch when they have one, else
 * the gym's first — the same fallback the order service uses, so a single-branch
 * gym never has to configure anything.
 */
const resolveBranchId = async (
  gymId: string,
  workerId: string
): Promise<string | null> => {
  const [worker] = await db
    .select({ branchId: workers.branchId })
    .from(workers)
    .where(and(eq(workers.gymId, gymId), eq(workers.workerId, workerId)))
    .limit(1);

  if (worker?.branchId) {
    return worker.branchId;
  }

  const [branch] = await db
    .select({ id: branches.branchId })
    .from(branches)
    .where(eq(branches.gymId, gymId))
    .limit(1);

  return branch?.id ?? null;
};

/** On-hand per product id, over live movements only. */
const loadStockByProduct = async (
  gymId: string
): Promise<Map<string, number>> => {
  const rows = await db
    .select({
      productId: storageActionsRep.productId,
      stock: sql<string>`SUM(${storageActionsRep.quantity})`,
    })
    .from(storageActionsRep)
    .leftJoin(
      storageActionsMain,
      eq(storageActionsMain.actionId, storageActionsRep.actionId)
    )
    .where(and(eq(storageActionsRep.gymId, gymId), isLiveMovement))
    .groupBy(storageActionsRep.productId);

  const byProduct = new Map<string, number>();

  for (const row of rows) {
    if (row.productId) {
      byProduct.set(row.productId, toNumber(row.stock));
    }
  }

  return byProduct;
};

/** What has been paid (or credited) against each delivery, by `action_id`. */
const loadPaidByAction = async (
  gymId: string,
  actionIds: string[]
): Promise<Map<string, number>> => {
  const paid = new Map<string, number>();

  if (actionIds.length === 0) {
    return paid;
  }

  const rows = await db
    .select({
      actionId: expenses.actionId,
      paid: sql<string>`SUM(${expenses.amount})`,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.gymId, gymId),
        isNull(expenses.voidedAt),
        inArray(expenses.actionId, actionIds)
      )
    )
    .groupBy(expenses.actionId);

  for (const row of rows) {
    if (row.actionId) {
      paid.set(row.actionId, toNumber(row.paid));
    }
  }

  return paid;
};

/** A delivery still carrying a balance, with what each of its lines was worth. */
interface OpenDelivery {
  branchId: string | null;
  id: string;
  remaining: number;
  time: Date | string | null;
}

const loadOpenDeliveries = async (
  gymId: string,
  supplierId?: string
): Promise<OpenDelivery[]> => {
  const documents = await db
    .select({
      id: storageActionsMain.actionId,
      branchId: storageActionsMain.branchId,
      time: storageActionsMain.time,
      total: storageActionsMain.totalPrice,
    })
    .from(storageActionsMain)
    .where(
      and(
        eq(storageActionsMain.gymId, gymId),
        eq(storageActionsMain.actionType, "in"),
        supplierId ? eq(storageActionsMain.supplierId, supplierId) : undefined,
        notDeleted
      )
    )
    .orderBy(asc(storageActionsMain.time));

  const paid = await loadPaidByAction(
    gymId,
    documents.map((document) => document.id)
  );

  return documents.map((document) => ({
    id: document.id,
    branchId: document.branchId,
    time: document.time,
    remaining: Math.max(
      toNumber(document.total) - (paid.get(document.id) ?? 0),
      0
    ),
  }));
};

/** Reads the open deliveries and their lines, then hands both to the split above. */
const loadSupplierDebtByProduct = async (
  gymId: string
): Promise<Map<string, number>> => {
  const open = (await loadOpenDeliveries(gymId)).filter(
    (delivery) => delivery.remaining > 0
  );

  if (open.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({
      actionId: storageActionsRep.actionId,
      productId: storageActionsRep.productId,
      value: sql<string>`SUM(ABS(${storageActionsRep.quantity}) * COALESCE(${storageActionsRep.unitCost}, 0))`,
    })
    .from(storageActionsRep)
    .where(
      and(
        eq(storageActionsRep.gymId, gymId),
        inArray(
          storageActionsRep.actionId,
          open.map((delivery) => delivery.id)
        )
      )
    )
    .groupBy(storageActionsRep.actionId, storageActionsRep.productId);

  const lines: DeliveryLine[] = [];

  for (const row of rows) {
    if (row.actionId && row.productId) {
      lines.push({
        actionId: row.actionId,
        productId: row.productId,
        value: toNumber(row.value),
      });
    }
  }

  return spreadDeliveryDebt(open, lines);
};

/**
 * The Inventar table: every product the gym stocks, what is on the shelf, and
 * what is still owed for it. Ingredients are included — milk in the fridge is
 * stock whether or not it is ever sold on its own.
 */
export const listStock = async (gymId: string): Promise<InventoryItem[]> => {
  const catalogPromise = db
    .select({
      cost: products.cost,
      id: products.productId,
      name: products.product,
      price: products.price,
      productType: products.productType,
      unit: products.unit,
    })
    .from(products)
    .where(eq(products.gymId, gymId))
    .orderBy(asc(products.product));

  const [catalog, stock, debt] = await Promise.all([
    catalogPromise,
    loadStockByProduct(gymId),
    loadSupplierDebtByProduct(gymId),
  ]);

  return catalog.map((product) => {
    const onHand = stock.get(product.id) ?? 0;

    return {
      cost: product.cost,
      id: product.id,
      name: product.name ?? "",
      price: product.price,
      productType: product.productType,
      status: stockStatusOf(onHand),
      stock: toQuantity(onHand),
      supplierDebt: toMoney(debt.get(product.id) ?? 0),
      unit: product.unit,
    };
  });
};

/**
 * The movement ledger, newest first — the whole history, or one product's, or
 * one kind of document's. Sales come through here too: the desk asking "where
 * did those twelve go?" does not care which screen wrote the row.
 */
export const listMovements = async (
  gymId: string,
  query: MovementQuery
): Promise<MovementView[]> => {
  const rows = await db
    .select({
      actionId: storageActionsRep.actionId,
      actionType: storageActionsMain.actionType,
      id: storageActionsRep.storageActionsRepId,
      movementType: storageActionsRep.movementType,
      note: storageActionsRep.note,
      productId: storageActionsRep.productId,
      productName: products.product,
      quantity: storageActionsRep.quantity,
      supplierName: suppliers.supplier,
      time: storageActionsRep.time,
      unitCost: storageActionsRep.unitCost,
      workerName: workers.fullname,
    })
    .from(storageActionsRep)
    .leftJoin(
      storageActionsMain,
      eq(storageActionsMain.actionId, storageActionsRep.actionId)
    )
    .leftJoin(products, eq(products.productId, storageActionsRep.productId))
    .leftJoin(
      suppliers,
      eq(suppliers.supplierId, storageActionsMain.supplierId)
    )
    .leftJoin(workers, eq(workers.workerId, storageActionsRep.createdBy))
    .where(
      and(
        eq(storageActionsRep.gymId, gymId),
        isLiveMovement,
        query.productId
          ? eq(storageActionsRep.productId, query.productId)
          : undefined,
        query.actionType
          ? eq(storageActionsMain.actionType, query.actionType)
          : undefined
      )
    )
    .orderBy(desc(storageActionsRep.time), desc(storageActionsRep.seq))
    .limit(query.limit);

  return rows.map((row) => ({
    actionId: row.actionId,
    actionType: row.actionType,
    id: row.id,
    movementType: row.movementType,
    note: row.note,
    productId: row.productId,
    productName: row.productName,
    quantity: row.quantity ?? "0.000",
    supplierName: row.supplierName,
    time: toIsoDate(row.time),
    unitCost: row.unitCost,
    workerName: row.workerName,
  }));
};

/** The products a document names, checked against the catalog in one query. */
const loadPricedProducts = async (
  gymId: string,
  productIds: string[]
): Promise<Map<string, { cost: string | null; name: string }>> => {
  const unique = [...new Set(productIds)];

  const rows = await db
    .select({
      cost: products.cost,
      id: products.productId,
      name: products.product,
    })
    .from(products)
    .where(and(eq(products.gymId, gymId), inArray(products.productId, unique)));

  const byId = new Map<string, { cost: string | null; name: string }>();

  for (const row of rows) {
    byId.set(row.id, { cost: row.cost, name: row.name ?? "" });
  }

  for (const id of unique) {
    if (!byId.has(id)) {
      throw new NotFoundError("Product not found");
    }
  }

  return byId;
};

const assertSupplierExists = async (
  gymId: string,
  supplierId: string
): Promise<void> => {
  const [supplier] = await db
    .select({ id: suppliers.supplierId })
    .from(suppliers)
    .where(
      and(eq(suppliers.gymId, gymId), eq(suppliers.supplierId, supplierId))
    )
    .limit(1);

  if (!supplier) {
    throw new NotFoundError("Supplier not found");
  }
};

export interface CreatedStockAction {
  id: string;
  /** Signed, so the caller can tell a correction that added from one that took away. */
  quantity: string;
  total: string;
}

/**
 * Kirim, Yaroqsiz or Qaytarish. One document, its signed ledger rows, and — for
 * a delivery paid on the spot or a return that credits the supplier — the
 * `expenses` row that settles it. All in one transaction: a ledger that moved
 * stock without the document explaining why is worse than a retryable failure.
 */
export const createStockAction = async (
  gymId: string,
  input: CreateStockActionInput,
  workerId: string | null
): Promise<CreatedStockAction> => {
  if (!workerId) {
    throw new UnauthorizedError("Missing x-worker-id");
  }

  const supplierId = input.supplierId?.trim() || null;
  const isDelivery = input.actionType === "in";
  const isReturn = input.actionType === "return";

  // A write-off has no counterparty: nobody is owed for stock that spoiled, and
  // silently dropping a supplier the caller named would hide a real mistake.
  if (supplierId && input.actionType === "writeoff") {
    throw new BadRequestError("A write-off has no supplier");
  }

  if (supplierId) {
    await assertSupplierExists(gymId, supplierId);
  }

  if (isReturn && !supplierId) {
    throw new BadRequestError(
      "A return must name the supplier it goes back to"
    );
  }

  const catalog = await loadPricedProducts(
    gymId,
    input.items.map((item) => item.productId)
  );

  // What each line is worth. A delivery states its own unit cost — that is the
  // point of recording one — while a write-off or return is valued at what the
  // product costs us, since no new price was agreed.
  const lines = input.items.map((item) => {
    const fallback = catalog.get(item.productId)?.cost ?? null;
    const unitCost = item.unitCost ?? fallback;
    const quantity = Number(item.quantity);

    return {
      lineValue: quantity * toNumber(unitCost),
      productId: item.productId,
      quantity,
      unitCost,
    };
  });

  const total = lines.reduce((sum, line) => sum + line.lineValue, 0);
  const quantityTotal = lines.reduce((sum, line) => sum + line.quantity, 0);

  // Never take more than the delivery is worth: an overpayment would sit as a
  // negative balance nothing on these screens can spend.
  const paidNow = isDelivery
    ? Math.max(0, Math.min(Number(input.paidAmount ?? 0), total))
    : 0;

  if (paidNow > 0 && !input.paymentMethod) {
    throw new BadRequestError("Say how the payment was made");
  }

  const branchId = await resolveBranchId(gymId, workerId);
  const actionId = nanoid(ID_LENGTH);
  const now = new Date();
  // Stock goes up on a delivery and down on anything sent back or thrown away.
  const sign = isDelivery ? 1 : -1;

  await db.transaction(async (tx) => {
    await tx.insert(storageActionsMain).values({
      actionId,
      actionType: input.actionType,
      branchId,
      description: input.description ?? null,
      gymId,
      isDeleted: false,
      responsible: workerId,
      supplierId,
      time: now,
      totalPrice: toMoney(total),
    });

    for (const line of lines) {
      await tx.insert(storageActionsRep).values({
        actionId,
        adjustmentId: null,
        branchId,
        createdBy: workerId,
        gymId,
        movementType: MOVEMENT_TYPE[input.actionType],
        note: input.note ?? null,
        orderRepId: null,
        productId: line.productId,
        quantity: toQuantity(sign * line.quantity),
        seq: null,
        storageActionsRepId: nanoid(ID_LENGTH),
        time: now,
        unitCost: line.unitCost,
      });
    }

    if (paidNow > 0) {
      await tx.insert(expenses).values({
        actionId,
        amount: toMoney(paidNow),
        branchId,
        category: SUPPLIER_EXPENSE,
        createdBy: workerId,
        gymId,
        method: input.paymentMethod ?? "cash",
        note: input.note ?? null,
        paidAt: now,
        supplierId,
        workerId: null,
      });
    }

    // Goods going back are a credit note, not cash: they pay the supplier's
    // oldest open deliveries down exactly as a payment would, which is what
    // keeps one balance per supplier instead of two that have to be netted.
    if (isReturn && supplierId && total > 0) {
      await applyToOpenDeliveries(tx, {
        amount: total,
        category: SUPPLIER_CREDIT,
        gymId,
        method: RETURN_METHOD,
        note: input.note ?? null,
        now,
        supplierId,
        workerId,
      });
    }
  });

  return {
    id: actionId,
    quantity: toQuantity(sign * quantityTotal),
    total: toMoney(total),
  };
};

/** The handle a `db.transaction` callback is given, so helpers can take one. */
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

interface Allocation {
  amount: number;
  category: string;
  gymId: string;
  method: string;
  note: string | null;
  now: Date;
  supplierId: string;
  workerId: string;
}

/**
 * Walks a supplier's open deliveries oldest-first and writes one `expenses` row
 * per delivery it touches. Attributing money to specific deliveries — rather
 * than keeping a running per-supplier number — is what stops a payment for last
 * month's crate from cancelling the balance of one that arrived this morning.
 *
 * Returns what it could not place, which is only ever non-zero if the caller
 * failed to cap the amount at the outstanding balance.
 */
const applyToOpenDeliveries = async (
  tx: Transaction,
  allocation: Allocation
): Promise<number> => {
  const open = await loadOpenDeliveries(
    allocation.gymId,
    allocation.supplierId
  );
  let leftover = allocation.amount;

  for (const delivery of open) {
    if (leftover <= 0) {
      break;
    }

    if (delivery.remaining <= 0) {
      continue;
    }

    const applied = Math.min(delivery.remaining, leftover);

    await tx.insert(expenses).values({
      actionId: delivery.id,
      amount: toMoney(applied),
      branchId: delivery.branchId,
      category: allocation.category,
      createdBy: allocation.workerId,
      gymId: allocation.gymId,
      method: allocation.method,
      note: allocation.note,
      paidAt: allocation.now,
      supplierId: allocation.supplierId,
      workerId: null,
    });

    leftover -= applied;
  }

  return leftover;
};

/**
 * Inventarizatsiya. The desk types what is physically there; the difference
 * against the ledger becomes one signed correction row per product that actually
 * moved. Products counted at exactly what the ledger says write nothing — a
 * stocktake that agreed should leave no trace beyond the document itself.
 */
export const createStocktake = async (
  gymId: string,
  input: CreateStocktakeInput,
  workerId: string | null
): Promise<CreatedStockAction> => {
  if (!workerId) {
    throw new UnauthorizedError("Missing x-worker-id");
  }

  await loadPricedProducts(
    gymId,
    input.items.map((item) => item.productId)
  );

  const onHand = await loadStockByProduct(gymId);

  const corrections = input.items
    .map((item) => ({
      delta: Number(item.counted) - (onHand.get(item.productId) ?? 0),
      productId: item.productId,
    }))
    // Below a thousandth there is nothing the column can even store.
    .filter((correction) => Math.abs(correction.delta) >= 0.0005);

  if (corrections.length === 0) {
    throw new ConflictError("The count already matches the ledger");
  }

  const branchId = await resolveBranchId(gymId, workerId);
  const actionId = nanoid(ID_LENGTH);
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx.insert(storageActionsMain).values({
      actionId,
      actionType: "stocktake",
      branchId,
      description: input.description ?? null,
      gymId,
      isDeleted: false,
      responsible: workerId,
      // A stocktake owes nobody anything; it reconciles what is already here.
      supplierId: null,
      time: now,
      totalPrice: "0.00",
    });

    for (const correction of corrections) {
      await tx.insert(storageActionsRep).values({
        actionId,
        adjustmentId: null,
        branchId,
        createdBy: workerId,
        gymId,
        movementType: MOVEMENT_TYPE.stocktake,
        note: input.note ?? null,
        orderRepId: null,
        productId: correction.productId,
        quantity: toQuantity(correction.delta),
        seq: null,
        storageActionsRepId: nanoid(ID_LENGTH),
        time: now,
        unitCost: null,
      });
    }
  });

  return {
    id: actionId,
    quantity: toQuantity(
      corrections.reduce((sum, correction) => sum + correction.delta, 0)
    ),
    total: "0.00",
  };
};

/**
 * Voids a document without erasing it: the header is flagged and its ledger rows
 * stop counting through the same join every read here uses. Nothing is deleted,
 * so a mistaken delivery leaves a trail rather than a hole.
 */
export const voidStockAction = async (
  gymId: string,
  actionId: string
): Promise<void> => {
  const [document] = await db
    .select({ id: storageActionsMain.actionId })
    .from(storageActionsMain)
    .where(
      and(
        eq(storageActionsMain.gymId, gymId),
        eq(storageActionsMain.actionId, actionId)
      )
    )
    .limit(1);

  if (!document) {
    throw new NotFoundError("Document not found");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(storageActionsMain)
      .set({ isDeleted: true })
      .where(
        and(
          eq(storageActionsMain.gymId, gymId),
          eq(storageActionsMain.actionId, actionId)
        )
      );

    // The money must go with it: leaving the payments would show a supplier
    // paid for a delivery that no longer exists.
    await tx
      .update(expenses)
      .set({ voidedAt: new Date() })
      .where(
        and(
          eq(expenses.gymId, gymId),
          eq(expenses.actionId, actionId),
          isNull(expenses.voidedAt)
        )
      );
  });
};

const toSupplierName = (value: string | null): string => value ?? "";

/** Every supplier with what they have delivered, been paid, and are still owed. */
export const listSuppliers = async (
  gymId: string
): Promise<SupplierSummary[]> => {
  const rows = await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.gymId, gymId))
    .orderBy(asc(suppliers.supplier));

  if (rows.length === 0) {
    return [];
  }

  const documents = await db
    .select({
      id: storageActionsMain.actionId,
      supplierId: storageActionsMain.supplierId,
      time: storageActionsMain.time,
      total: storageActionsMain.totalPrice,
    })
    .from(storageActionsMain)
    .where(
      and(
        eq(storageActionsMain.gymId, gymId),
        eq(storageActionsMain.actionType, "in"),
        notDeleted
      )
    );

  const paid = await loadPaidByAction(
    gymId,
    documents.map((document) => document.id)
  );

  const delivered = new Map<string, number>();
  const settled = new Map<string, number>();
  const latest = new Map<string, Date | string>();

  for (const document of documents) {
    if (!document.supplierId) {
      continue;
    }

    const value = toNumber(document.total);

    delivered.set(
      document.supplierId,
      (delivered.get(document.supplierId) ?? 0) + value
    );
    settled.set(
      document.supplierId,
      (settled.get(document.supplierId) ?? 0) +
        Math.min(paid.get(document.id) ?? 0, value)
    );

    const previous = latest.get(document.supplierId);

    if (document.time && (!previous || document.time > previous)) {
      latest.set(document.supplierId, document.time);
    }
  }

  return rows.map((row) => {
    const total = delivered.get(row.supplierId) ?? 0;
    const paidTotal = settled.get(row.supplierId) ?? 0;

    return {
      delivered: toMoney(total),
      id: row.supplierId,
      lastDeliveryAt: toIsoDate(latest.get(row.supplierId) ?? null),
      name: toSupplierName(row.supplier),
      paid: toMoney(paidTotal),
      passport: row.passport,
      phone: row.phone,
      remaining: toMoney(Math.max(total - paidTotal, 0)),
      supplierType: row.supplierType,
    };
  });
};

export const createSupplier = async (
  gymId: string,
  input: CreateSupplierInput
): Promise<SupplierSummary> => {
  const existing = await db
    .select({ id: suppliers.supplierId })
    .from(suppliers)
    .where(
      and(eq(suppliers.gymId, gymId), eq(suppliers.supplier, input.supplier))
    )
    .limit(1);

  if (existing.length > 0) {
    throw new ConflictError("A supplier with this name already exists");
  }

  const supplierId = nanoid(SHORT_ID_LENGTH);

  await db.insert(suppliers).values({
    description: input.description ?? null,
    gymId,
    passport: input.passport ?? null,
    phone: input.phone ?? null,
    supplier: input.supplier,
    supplierId,
    supplierType: input.supplierType ?? null,
  });

  return {
    delivered: "0.00",
    id: supplierId,
    lastDeliveryAt: null,
    name: input.supplier,
    paid: "0.00",
    passport: input.passport ?? null,
    phone: input.phone ?? null,
    remaining: "0.00",
    supplierType: input.supplierType ?? null,
  };
};

export const updateSupplier = async (
  gymId: string,
  supplierId: string,
  input: UpdateSupplierInput
): Promise<void> => {
  await assertSupplierExists(gymId, supplierId);

  // Only what the caller actually sent: a form that edits the phone must not
  // blank the description it never showed.
  const changes: Partial<typeof suppliers.$inferInsert> = {};

  if (input.supplier !== undefined) {
    changes.supplier = input.supplier;
  }

  if (input.phone !== undefined) {
    changes.phone = input.phone ?? null;
  }

  if (input.description !== undefined) {
    changes.description = input.description ?? null;
  }

  if (input.supplierType !== undefined) {
    changes.supplierType = input.supplierType ?? null;
  }

  if (input.passport !== undefined) {
    changes.passport = input.passport ?? null;
  }

  if (Object.keys(changes).length === 0) {
    return;
  }

  await db
    .update(suppliers)
    .set(changes)
    .where(
      and(eq(suppliers.gymId, gymId), eq(suppliers.supplierId, supplierId))
    );
};

/**
 * A supplier may only go once nothing hangs off them — a delivery whose supplier
 * vanished is a document that can no longer say who was owed.
 */
export const deleteSupplier = async (
  gymId: string,
  supplierId: string
): Promise<void> => {
  await assertSupplierExists(gymId, supplierId);

  const [document] = await db
    .select({ id: storageActionsMain.actionId })
    .from(storageActionsMain)
    .where(
      and(
        eq(storageActionsMain.gymId, gymId),
        eq(storageActionsMain.supplierId, supplierId),
        notDeleted
      )
    )
    .limit(1);

  if (document) {
    throw new ConflictError("This supplier has deliveries on record");
  }

  await db
    .delete(suppliers)
    .where(
      and(eq(suppliers.gymId, gymId), eq(suppliers.supplierId, supplierId))
    );
};

/**
 * Settles a supplier's balance, oldest delivery first — one figure and one
 * amount box at the desk, specific deliveries underneath.
 */
export const paySupplier = async (
  gymId: string,
  supplierId: string,
  input: PaySupplierInput,
  workerId: string | null
): Promise<SupplierSummary> => {
  if (!workerId) {
    throw new UnauthorizedError("Missing x-worker-id");
  }

  await assertSupplierExists(gymId, supplierId);

  const open = await loadOpenDeliveries(gymId, supplierId);
  const outstanding = open.reduce(
    (sum, delivery) => sum + delivery.remaining,
    0
  );

  if (outstanding <= 0) {
    throw new ConflictError("No outstanding balance");
  }

  const amount = Math.min(Number(input.amount), outstanding);
  const now = new Date();

  await db.transaction(async (tx) => {
    await applyToOpenDeliveries(tx, {
      amount,
      category: SUPPLIER_EXPENSE,
      gymId,
      method: input.method,
      note: input.note ?? null,
      now,
      supplierId,
      workerId,
    });
  });

  const summaries = await listSuppliers(gymId);
  const summary = summaries.find((row) => row.id === supplierId);

  if (!summary) {
    throw new NotFoundError("Supplier not found");
  }

  return summary;
};
