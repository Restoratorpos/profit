import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db/index.js";
import {
  branches,
  comboComponents,
  combos,
  ID_LENGTH,
  income,
  members,
  orderItemAdjustments,
  orderItems,
  orders,
  products,
  storageActionsRep,
  workers,
} from "../db/schema.js";
import { cappedDiscount, discountOf } from "../lib/discount.js";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from "../lib/errors.js";
import type {
  CreateOrderInput,
  EditOrderItemsInput,
  PaymentLeg,
  PayOrdersInput,
  RemovalDisposition,
  RemovalReason,
} from "../schemas/order.js";

/** Every query filters by gymId. An unscoped one is a data leak, not a bug. */

/**
 * Who can carry a shop balance. A `guest` walk-in pays at the till and has no
 * account to chase, so it never appears on the debt screen — but staff buy from
 * the bar on the same terms a member does, and their ids live in `workers`.
 */
export const DEBTOR_TYPES = ["member", "worker"] as const;

export type DebtorType = (typeof DEBTOR_TYPES)[number];

/** The same list, mutable — drizzle's `inArray` will not take a readonly tuple. */
const DEBTOR_TYPE_VALUES: string[] = [...DEBTOR_TYPES];

/** One buyer's shop debt, collapsed from all of their orders into one line. */
export interface MemberOrderSummary {
  id: string;
  latestOrderAt: string | null;
  name: string;
  /** How many non-void orders they have, across all time. */
  orderCount: number;
  phone: string | null;
  /** Outstanding: the sum of what is still owed on their unsettled orders. */
  remaining: string;
  /** Everything they have ever ordered, paid or not. */
  total: string;
  /** Which table the buyer came from — a member or a member of staff. */
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
    /** The card number, or null for a member of staff — see `Debtor`. */
    code: string | null;
    id: string;
    name: string;
    phone: string | null;
  };
  orders: MemberOrderView[];
  /** Aggregates across every order below, so the drawer footer needs no math. */
  paid: string;
  remaining: string;
  total: string;
}

const toIsoDate = (value: Date | string | null): string | null => {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : String(value);
};

const toMoney = (value: number): string => value.toFixed(2);

/** MySQL returns DECIMAL as a string; SUM()/MAX() of nothing come back null. */
const toNumber = (value: string | number | null): number => {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * `status <> 'void'` is the same guard the members list uses, kept identical so
 * the shop-debt figure on both screens agrees.
 *
 * `user_type` is always part of the filter, never `user_id` alone: member and
 * worker ids share one id space, so an unqualified id could in principle pull in
 * the wrong person's orders. Pass `type` for anything that touches one buyer;
 * omit it only to list every account carrying a balance.
 */
const debtorOrderScope = (gymId: string, type?: DebtorType) =>
  and(
    eq(orders.gymId, gymId),
    type
      ? eq(orders.userType, type)
      : inArray(orders.userType, DEBTOR_TYPE_VALUES),
    ne(orders.status, "void")
  );

/** A buyer who can owe: their name and phone, and which table they came from. */
interface Debtor {
  /**
   * The short human-facing card number, which only members carry — staff have no
   * `unique_id` column, so a worker's balance shows a name and nothing else.
   */
  code: string | null;
  id: string;
  name: string;
  phone: string | null;
  type: DebtorType;
}

/**
 * Resolves an id to the person behind it, members first. Both tables are checked
 * because the shop sells to staff as well, and the caller needs the `type` to
 * scope every follow-up query — and to know whether a payment may be attributed
 * to a member (`income.member_id`) at all.
 */
const loadDebtor = async (gymId: string, userId: string): Promise<Debtor> => {
  const [member] = await db
    .select({
      id: members.memberId,
      name: members.fullname,
      phone: members.phone,
      // Same row, no extra query — the drawer identifies the buyer by it.
      code: members.uniqueId,
    })
    .from(members)
    .where(and(eq(members.gymId, gymId), eq(members.memberId, userId)))
    .limit(1);

  if (member) {
    return {
      code: member.code,
      id: member.id ?? userId,
      name: member.name ?? "",
      phone: member.phone,
      type: "member",
    };
  }

  const [worker] = await db
    .select({
      id: workers.workerId,
      name: workers.fullname,
      phone: workers.phone,
    })
    .from(workers)
    .where(and(eq(workers.gymId, gymId), eq(workers.workerId, userId)))
    .limit(1);

  if (worker) {
    return {
      code: null,
      id: worker.id,
      name: worker.name ?? "",
      phone: worker.phone,
      type: "worker",
    };
  }

  throw new NotFoundError("Buyer not found");
};

/**
 * What has been paid toward each of the given orders. Voided income is excluded
 * everywhere, so a refunded payment stops counting the moment it is voided.
 */
const loadPaidByOrder = async (
  gymId: string,
  orderIds: string[]
): Promise<Map<string | null, number>> => {
  if (orderIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({
      orderId: income.targetId,
      paid: sql<string>`SUM(${income.amount})`,
    })
    .from(income)
    .where(
      and(
        eq(income.gymId, gymId),
        eq(income.category, "order"),
        isNull(income.voidedAt),
        inArray(income.targetId, orderIds)
      )
    )
    .groupBy(income.targetId);

  return new Map(rows.map((row) => [row.orderId, toNumber(row.paid)]));
};

/** The buyer's orders that still owe something — the editable set. */
const loadOpenMemberOrders = async (
  gymId: string,
  userId: string,
  type: DebtorType
) =>
  db
    .select({
      id: orders.orderId,
      branchId: orders.branchId,
      createdAt: orders.createdAt,
      discount: orders.discount,
      total: orders.totalPrice,
    })
    .from(orders)
    .where(
      and(
        debtorOrderScope(gymId, type),
        eq(orders.userId, userId),
        isNull(orders.settledAt)
      )
    )
    .orderBy(asc(orders.createdAt));

/**
 * One row per buyer rather than one per order: the desk wants to see who owes
 * money, not a ledger. Built from two grouped queries so a gym with thousands
 * of orders still renders in a fixed number of round trips.
 *
 * Both name tables are joined, each gated on the matching `user_type`, so a
 * member and a worker who happen to share an id can never borrow each other's
 * name — and `user_type` is part of the grouping key for the same reason.
 */
export const listMemberOrderDebts = async (
  gymId: string
): Promise<MemberOrderSummary[]> => {
  const name = sql<
    string | null
  >`COALESCE(${members.fullname}, ${workers.fullname})`;

  const rows = await db
    .select({
      userId: orders.userId,
      userType: orders.userType,
      name,
      phone: sql<string | null>`COALESCE(${members.phone}, ${workers.phone})`,
      total: sql<string>`SUM(${orders.totalPrice})`,
      count: sql<number>`COUNT(*)`,
      latest: sql<string | null>`MAX(${orders.createdAt})`,
      unsettledTotal: sql<string>`SUM(CASE WHEN ${orders.settledAt} IS NULL THEN ${orders.totalPrice} ELSE 0 END)`,
    })
    .from(orders)
    .leftJoin(
      members,
      and(
        eq(members.gymId, orders.gymId),
        eq(members.memberId, orders.userId),
        eq(orders.userType, "member")
      )
    )
    .leftJoin(
      workers,
      and(
        eq(workers.gymId, orders.gymId),
        eq(workers.workerId, orders.userId),
        eq(orders.userType, "worker")
      )
    )
    .where(debtorOrderScope(gymId))
    .groupBy(
      orders.userId,
      orders.userType,
      members.fullname,
      members.phone,
      workers.fullname,
      workers.phone
    )
    .orderBy(asc(name));

  if (rows.length === 0) {
    return [];
  }

  // What has already been paid toward orders that are still open. Joining
  // income to its order lets a payment from a *previous*, already-settled debt
  // stay out of this figure — otherwise it would cancel a new order's balance.
  const paidRows = await db
    .select({
      userId: orders.userId,
      userType: orders.userType,
      paid: sql<string>`SUM(${income.amount})`,
    })
    .from(income)
    .innerJoin(
      orders,
      and(eq(orders.gymId, income.gymId), eq(orders.orderId, income.targetId))
    )
    .where(
      and(
        eq(income.gymId, gymId),
        eq(income.category, "order"),
        isNull(income.voidedAt),
        isNull(orders.settledAt),
        inArray(orders.userType, DEBTOR_TYPE_VALUES),
        ne(orders.status, "void")
      )
    )
    .groupBy(orders.userId, orders.userType);

  // Keyed on both, so a member and a worker sharing an id keep separate balances.
  const paidByBuyer = new Map(
    paidRows.map((row) => [`${row.userType}:${row.userId}`, toNumber(row.paid)])
  );

  return rows.map((row) => {
    // The scope only admits the two debtor types, so anything else is impossible.
    const userType = (row.userType ?? "member") as DebtorType;
    const paid = paidByBuyer.get(`${userType}:${row.userId}`) ?? 0;
    const remaining = Math.max(toNumber(row.unsettledTotal) - paid, 0);

    return {
      id: row.userId ?? "",
      name: row.name ?? "",
      phone: row.phone,
      orderCount: toNumber(row.count),
      latestOrderAt: toIsoDate(row.latest),
      total: toMoney(toNumber(row.total)),
      remaining: toMoney(remaining),
      userType,
    };
  });
};

/**
 * A buyer's full order history, newest first — the order the desk reads it in,
 * most-recent purchase at the top. Each order carries its own line items and a
 * paid/remaining split, and the top-level totals sum them so the drawer footer
 * needs no arithmetic of its own.
 */
export const getMemberOrderDetail = async (
  gymId: string,
  userId: string
): Promise<MemberOrderDetail> => {
  const debtor = await loadDebtor(gymId, userId);
  const buyer = {
    code: debtor.code,
    id: debtor.id,
    name: debtor.name,
    phone: debtor.phone,
  };

  // Only orders that still owe something. A fully-paid order is closed history —
  // the desk wants to see what is left to collect, not a lifetime receipt, so a
  // settled order drops off and its totals stop counting toward the summary.
  const orderRows = await db
    .select({
      id: orders.orderId,
      total: orders.totalPrice,
      discount: orders.discount,
      createdAt: orders.createdAt,
      settledAt: orders.settledAt,
    })
    .from(orders)
    .where(
      and(
        debtorOrderScope(gymId, debtor.type),
        eq(orders.userId, userId),
        isNull(orders.settledAt)
      )
    )
    .orderBy(desc(orders.createdAt));

  const orderIds = orderRows.map((row) => row.id);

  if (orderIds.length === 0) {
    return {
      member: buyer,
      orders: [],
      total: toMoney(0),
      paid: toMoney(0),
      remaining: toMoney(0),
    };
  }

  const itemRows = await db
    .select({
      id: orderItems.orderRepId,
      orderId: orderItems.orderId,
      name: orderItems.name,
      quantity: orderItems.quantity,
      price: orderItems.price,
      lineTotal: orderItems.lineTotal,
      comboId: orderItems.comboId,
    })
    .from(orderItems)
    .where(
      and(
        eq(orderItems.gymId, gymId),
        inArray(orderItems.orderId, orderIds),
        isNull(orderItems.voidedAt)
      )
    )
    .orderBy(asc(orderItems.createdAt));

  const itemsByOrder = new Map<string, OrderItemView[]>();

  for (const item of itemRows) {
    if (!item.orderId) {
      continue;
    }

    const list = itemsByOrder.get(item.orderId) ?? [];

    list.push({
      id: item.id,
      isCombo: Boolean(item.comboId),
      name: item.name ?? "",
      quantity: toNumber(item.quantity),
      price: toMoney(toNumber(item.price)),
      lineTotal: toMoney(toNumber(item.lineTotal)),
    });
    itemsByOrder.set(item.orderId, list);
  }

  const paidByOrder = await loadPaidByOrder(gymId, orderIds);

  let total = 0;
  let paidTotal = 0;
  let remainingTotal = 0;

  const orderViews: MemberOrderView[] = orderRows.map((row) => {
    const orderTotal = toNumber(row.total);
    const paid = paidByOrder.get(row.id) ?? 0;
    // A settled order owes nothing regardless of how it was paid — some legacy
    // orders were settled at the till with no income row of their own.
    const remaining = row.settledAt ? 0 : Math.max(orderTotal - paid, 0);

    total += orderTotal;
    paidTotal += paid;
    remainingTotal += remaining;

    return {
      id: row.id,
      createdAt: toIsoDate(row.createdAt),
      settledAt: toIsoDate(row.settledAt),
      // What was taken off, or null when nothing was. The drawer only shows the
      // line when there is one, so "no discount" needs no figure of its own.
      discount: row.discount ? toMoney(toNumber(row.discount)) : null,
      total: toMoney(orderTotal),
      paid: toMoney(paid),
      remaining: toMoney(remaining),
      items: itemsByOrder.get(row.id) ?? [],
    };
  });

  return {
    member: buyer,
    orders: orderViews,
    total: toMoney(total),
    paid: toMoney(paidTotal),
    remaining: toMoney(remainingTotal),
  };
};

/**
 * Pays down a member's outstanding shop balance. The desk enters one amount for
 * the whole balance; it is applied to their oldest unsettled orders first, and
 * an order that becomes fully covered is stamped `settled_at`. One income row
 * is written per order the payment touches, so each order keeps an accurate
 * paid figure and a later refund can be voided against the right order.
 */
export const payMemberOrders = async (
  gymId: string,
  userId: string,
  input: PayOrdersInput,
  workerId: string | null
): Promise<MemberOrderDetail> => {
  // Income rows are NOT NULL on `created_by`: a payment is always attributable
  // to an operator. Saying so plainly beats a MySQL error no desk can act on.
  if (!workerId) {
    throw new UnauthorizedError("Missing x-worker-id");
  }

  const debtor = await loadDebtor(gymId, userId);
  const openOrders = await loadOpenMemberOrders(gymId, userId, debtor.type);

  if (openOrders.length === 0) {
    throw new ConflictError("No outstanding balance");
  }

  const paidByOrder = await loadPaidByOrder(
    gymId,
    openOrders.map((row) => row.id)
  );

  const outstanding = openOrders.map((row) => ({
    id: row.id,
    branchId: row.branchId,
    discount: toNumber(row.discount),
    remaining: Math.max(
      toNumber(row.total) - (paidByOrder.get(row.id) ?? 0),
      0
    ),
    total: toNumber(row.total),
  }));

  const totalRemaining = outstanding.reduce(
    (sum, order) => sum + order.remaining,
    0
  );

  if (totalRemaining <= 0) {
    throw new ConflictError("No outstanding balance");
  }

  /*
   * A discount given while settling is forgiven debt: it comes off the balance
   * before any money is applied, oldest order first — the same order the payment
   * itself walks, so the two agree about which orders they touched.
   *
   * Resolved against what is *still owed* rather than the original sale, because
   * that is the figure on the screen the desk is discounting.
   */
  let forgiving = discountOf(totalRemaining, input.discount);

  // Never take more than is owed *after* the discount, or a stale client could
  // book a credit against a balance the discount had already cleared.
  let leftover = Math.min(
    Number(input.amount),
    Math.max(totalRemaining - forgiving, 0)
  );
  const now = new Date();

  /**
   * Writes off part of one order: its total drops by what was forgiven and its
   * `discount` grows by the same, so `total - paid` is still the debt and the row
   * still says what was given away. Returns what it took.
   */
  const forgiveOn = async (
    tx: Transaction,
    order: (typeof outstanding)[number],
    asked: number
  ): Promise<number> => {
    const forgiven = Math.min(order.remaining, asked);

    if (forgiven <= 0) {
      return 0;
    }

    await tx
      .update(orders)
      .set({
        totalPrice: toMoney(order.total - forgiven),
        discount: toMoney(order.discount + forgiven),
      })
      .where(and(eq(orders.gymId, gymId), eq(orders.orderId, order.id)));

    return forgiven;
  };

  const settle = (tx: Transaction, orderId: string) =>
    tx
      .update(orders)
      .set({ settledAt: now })
      .where(and(eq(orders.gymId, gymId), eq(orders.orderId, orderId)));

  await db.transaction(async (tx) => {
    for (const order of outstanding) {
      if (order.remaining <= 0) {
        continue;
      }

      // Forgiven first, so the payment below only ever sees what is really left.
      const forgiven = await forgiveOn(tx, order, forgiving);

      forgiving -= forgiven;
      order.remaining -= forgiven;

      // A discount that cleared the order settles it with no income row at all —
      // nothing was collected against it.
      if (order.remaining <= 0) {
        await settle(tx, order.id);
        continue;
      }

      if (leftover <= 0) {
        continue;
      }

      const applied = Math.min(order.remaining, leftover);

      await tx.insert(income).values({
        gymId,
        branchId: order.branchId,
        category: "order",
        targetId: order.id,
        // `member_id` means a member. Staff paying off a bar tab leaves it null
        // rather than parking a worker id in a column that reads as a member.
        memberId: debtor.type === "member" ? userId : null,
        amount: toMoney(applied),
        paymentType: input.paymentType,
        paidAt: now,
        voidedAt: null,
        voidedBy: null,
        createdBy: workerId,
        note: null,
      });

      // Fully covered now — a settled order is what drops the member off the
      // unpaid tab and stops its total counting toward their debt.
      if (applied >= order.remaining) {
        await settle(tx, order.id);
      }

      leftover -= applied;
    }
  });

  return getMemberOrderDetail(gymId, userId);
};

/**
 * A sale happens at a branch — the operator's. Gym-level staff have none, so we
 * fall back to the gym's first branch rather than writing a branchless order that
 * no branch-scoped report would ever see.
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

export interface CreatedOrder {
  id: string;
  total: string;
}

/** A signed stock deduction for one real product the line consumes. */
interface StockMovement {
  productId: string | null;
  /** Magnitude sold (positive); the caller writes it as a −quantity movement. */
  quantity: number;
  /** The product's cost, as stored — or null if the product is gone. */
  unitCost: string | null;
}

/** A resolved ticket line — either a product or a combo, priced server-side. */
interface OrderLine {
  comboId: string | null;
  /** Per-unit cost as a decimal string, for the order_items snapshot. */
  cost: string | null;
  lineTotal: number;
  movements: StockMovement[];
  name: string;
  orderRepId: string;
  /** Per-unit sale price. */
  price: number;
  productId: string | null;
  /** How many of this line (whole units). */
  quantity: number;
}

/**
 * Turns the client's items into priced lines, reading price and makeup from the
 * catalog so neither is trusted from the client. A product line is one stock
 * movement; a combo line snapshots the combo price and fans out into one
 * movement per component (component quantity × how many combos were sold), so
 * selling a combo draws its underlying products down off the shelf.
 */
const buildOrderLines = async (
  gymId: string,
  items: CreateOrderInput["items"]
): Promise<OrderLine[]> => {
  const productItemIds = new Set<string>();
  const comboItemIds = new Set<string>();

  for (const item of items) {
    if (item.productId) {
      productItemIds.add(item.productId);
    } else if (item.comboId) {
      comboItemIds.add(item.comboId);
    }
  }

  const comboIds = [...comboItemIds];

  const comboRows =
    comboIds.length > 0
      ? await db
          .select({
            id: combos.comboId,
            name: combos.combo,
            price: combos.price,
          })
          .from(combos)
          .where(
            and(eq(combos.gymId, gymId), inArray(combos.comboId, comboIds))
          )
      : [];

  const comboById = new Map(comboRows.map((row) => [row.id, row]));

  const componentRows =
    comboIds.length > 0
      ? await db
          .select({
            comboId: comboComponents.comboId,
            productId: comboComponents.productId,
            quantity: comboComponents.quantity,
          })
          .from(comboComponents)
          .where(inArray(comboComponents.comboId, comboIds))
      : [];

  const componentsByCombo = new Map<string, typeof componentRows>();

  for (const row of componentRows) {
    if (!row.comboId) {
      continue;
    }

    const list = componentsByCombo.get(row.comboId) ?? [];

    list.push(row);
    componentsByCombo.set(row.comboId, list);
  }

  // One product fetch covers both direct product lines and combo components.
  const allProductIds = new Set(productItemIds);

  for (const row of componentRows) {
    if (row.productId) {
      allProductIds.add(row.productId);
    }
  }

  const productRows =
    allProductIds.size > 0
      ? await db
          .select({
            id: products.productId,
            name: products.product,
            price: products.price,
            cost: products.cost,
          })
          .from(products)
          .where(
            and(
              eq(products.gymId, gymId),
              inArray(products.productId, [...allProductIds])
            )
          )
      : [];

  const productById = new Map(productRows.map((row) => [row.id, row]));

  return items.map((item) => {
    const orderRepId = nanoid(ID_LENGTH);

    if (item.productId) {
      const product = productById.get(item.productId);

      if (!product) {
        throw new NotFoundError("Product not found");
      }

      const price = toNumber(product.price);

      return {
        comboId: null,
        cost: product.cost,
        lineTotal: price * item.quantity,
        movements: [
          {
            productId: item.productId,
            quantity: item.quantity,
            unitCost: product.cost,
          },
        ],
        name: product.name ?? "",
        orderRepId,
        price,
        productId: item.productId,
        quantity: item.quantity,
      };
    }

    const comboId = item.comboId;

    // The schema's refine guarantees one of the two, so this only satisfies the
    // types — an item with neither never reaches here.
    if (!comboId) {
      throw new BadRequestError("Item must reference a product or a combo");
    }

    const combo = comboById.get(comboId);

    if (!combo) {
      throw new NotFoundError("Combo not found");
    }

    const components = componentsByCombo.get(comboId) ?? [];
    let perUnitCost = 0;
    const movements: StockMovement[] = [];

    for (const component of components) {
      const product = component.productId
        ? productById.get(component.productId)
        : undefined;
      const componentQty = toNumber(component.quantity);

      perUnitCost += toNumber(product?.cost ?? null) * componentQty;
      movements.push({
        productId: component.productId,
        quantity: componentQty * item.quantity,
        unitCost: product?.cost ?? null,
      });
    }

    const price = toNumber(combo.price);

    return {
      comboId,
      cost: toMoney(perUnitCost),
      lineTotal: price * item.quantity,
      movements,
      name: combo.name ?? "",
      orderRepId,
      price,
      productId: null,
      quantity: item.quantity,
    };
  });
};

/** The handle a `db.transaction` callback is given, so helpers can take one. */
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Writes one resolved line onto an order: the `order_items` row, then the stock
 * leaving the shelf — a signed −quantity row per real product, linked to the
 * line so a later return traces back to what was sold. A product line has one
 * movement; a combo line has one per component.
 */
const insertOrderLine = async (
  tx: Transaction,
  input: {
    branchId: string | null;
    gymId: string;
    line: OrderLine;
    orderId: string;
    time: Date;
    workerId: string;
  }
): Promise<void> => {
  const { branchId, gymId, line, orderId, time, workerId } = input;

  await tx.insert(orderItems).values({
    orderRepId: line.orderRepId,
    gymId,
    branchId,
    orderId,
    // A combo line carries the combo, not a single product.
    productId: line.productId,
    name: line.name,
    quantity: line.quantity,
    price: toMoney(line.price),
    cost: line.cost,
    lineTotal: toMoney(line.lineTotal),
    comboId: line.comboId,
    comboPrice: line.comboId ? toMoney(line.price) : null,
    isSaved: true,
    savedAt: time,
    status: "active",
    createdAt: time,
    voidedAt: null,
    voidedBy: null,
  });

  for (const movement of line.movements) {
    await tx.insert(storageActionsRep).values({
      storageActionsRepId: nanoid(ID_LENGTH),
      gymId,
      branchId,
      productId: movement.productId,
      actionId: null,
      orderRepId: line.orderRepId,
      adjustmentId: null,
      movementType: "sale",
      quantity: (-movement.quantity).toFixed(3),
      unitCost: movement.unitCost,
      time,
      createdBy: workerId,
      note: null,
      seq: null,
    });
  }
};

/** One income row a checkout should write: a method and what it took. */
export interface SettlementRow {
  amount: number;
  method: string;
}

/** Below this, a shortfall is decimal noise rather than money anybody owes. */
export const SETTLED_EPSILON = 0.005;

/**
 * What a sale collects, and what it leaves behind.
 *
 * Pure, and exported for that reason: this is the one calculation in this file
 * that quietly gets money wrong, so it is tested for real rather than through a
 * mock.
 *
 * The legs are walked in the order the desk entered them, each taking what it
 * asks for or — with no amount — whatever is still outstanding. Every leg is
 * capped at what is actually left, so an overpayment settles the sale instead
 * of booking a credit, and a client that miscounts cannot make the tills report
 * more than the sale was worth.
 *
 * Each paying leg becomes its own income row, because a cashbox balance is
 * `SUM(income.amount)` grouped by `payment_type` — a split booked as one row
 * would fill one drawer and leave the other short by exactly the difference.
 *
 * Two methods take nothing and end the walk wherever they appear. `debt` leaves
 * the rest on the buyer. `free` writes it off, and adds a zero row: `orders`
 * has no column for how a sale was paid, so that row is the only place a comp
 * can be recorded — without it, money nobody will collect is indistinguishable
 * from money somebody settled off the books, and nobody is attributable for it.
 *
 * Legs that simply run out leave the rest owed, so a lone
 * `[{ method: "cash", amount: 20000 }]` against a 50 000 sale still means what
 * it always meant.
 */
export const settleCheckout = (
  total: number,
  legs: readonly PaymentLeg[]
): {
  isSettled: boolean;
  paid: number;
  remainder: number;
  rows: SettlementRow[];
} => {
  const rows: SettlementRow[] = [];
  let outstanding = total;
  let isWaived = false;

  for (const leg of legs) {
    // Nothing left to pay: any further leg is a control the desk left behind,
    // not money, and booking it would credit a till twice.
    if (outstanding <= SETTLED_EPSILON || leg.method === "debt") {
      break;
    }

    if (leg.method === "free") {
      isWaived = true;
      rows.push({ amount: 0, method: "free" });
      break;
    }

    const asked = leg.amount == null ? outstanding : Number(leg.amount);
    const taken = Math.max(0, Math.min(asked, outstanding));

    if (taken > 0) {
      rows.push({ amount: taken, method: leg.method });
      outstanding -= taken;
    }
  }

  const remainder = outstanding > SETTLED_EPSILON ? outstanding : 0;

  return {
    isSettled: isWaived || remainder === 0,
    paid: total - outstanding,
    remainder,
    rows,
  };
};

/**
 * Rings up a shop sale: the order, its line items, the signed stock movements,
 * and — when it is paid at the till — the income rows. Prices are read from the
 * catalog here, never trusted from the client. `cash`/`card` settle the order on
 * the spot; `debt` leaves it open on the member's balance for the pay flow above.
 * All-or-nothing: a sale that records stock going out but no order (or vice
 * versa) is worse than a failure the operator can retry.
 */
export const createOrder = async (
  gymId: string,
  input: CreateOrderInput,
  workerId: string | null
): Promise<CreatedOrder> => {
  if (!workerId) {
    throw new UnauthorizedError("Missing x-worker-id");
  }

  const memberId = input.userId?.trim() || null;

  // A walk-in has no balance to chase, so it cannot be sold on credit. Caught
  // here as well as after the totals, so the obvious case fails before the
  // catalog is read — and named, rather than inferred from a shortfall.
  if (input.payments.some((leg) => leg.method === "debt") && !memberId) {
    throw new BadRequestError("A walk-in sale must be paid at checkout");
  }

  if (memberId) {
    const [member] = await db
      .select({ id: members.memberId })
      .from(members)
      .where(and(eq(members.gymId, gymId), eq(members.memberId, memberId)))
      .limit(1);

    if (!member) {
      throw new NotFoundError("Member not found");
    }
  }

  const lines = await buildOrderLines(gymId, input.items);
  const gross = lines.reduce((sum, line) => sum + line.lineTotal, 0);

  /*
   * The discount comes off before the legs are walked, so every downstream figure
   * means the discounted sale: what the tills take, what settles it, and what is
   * left owed. A percentage resolves against `gross` — computed here from the
   * catalog — rather than against anything the client sent.
   */
  const discount = discountOf(gross, input.discount);
  const total = gross - discount;

  const { isSettled, rows } = settleCheckout(total, input.payments);

  // An unpaid balance lives on a member; a walk-in must clear the sale in full.
  if (!(isSettled || memberId)) {
    throw new BadRequestError("A walk-in sale must be paid at checkout");
  }

  const branchId = await resolveBranchId(gymId, workerId);
  const now = new Date();
  const orderId = nanoid(ID_LENGTH);

  await db.transaction(async (tx) => {
    await tx.insert(orders).values({
      orderId,
      gymId,
      branchId,
      userId: memberId,
      userType: memberId ? "member" : "guest",
      totalPrice: toMoney(total),
      // Null rather than "0.00" when nothing was given, so "was this discounted"
      // is answerable without reading it as a discount of nothing.
      discount: discount > 0 ? toMoney(discount) : null,
      createdAt: now,
      // Covered in full settles it now; a short or credit sale stays open.
      settledAt: isSettled ? now : null,
      status: "completed",
    });

    for (const line of lines) {
      await insertOrderLine(tx, {
        branchId,
        gymId,
        line,
        orderId,
        time: now,
        workerId,
      });
    }

    // One row per method that actually took money, so each till is credited
    // with its own share — see `settleCheckout` for which rows those are.
    for (const row of rows) {
      await tx.insert(income).values({
        gymId,
        branchId,
        category: "order",
        targetId: orderId,
        memberId,
        amount: toMoney(row.amount),
        paymentType: row.method,
        paidAt: now,
        voidedAt: null,
        voidedBy: null,
        createdBy: workerId,
        note: null,
      });
    }
  });

  return { id: orderId, total: toMoney(total) };
};

/** What one unit of a line takes off the shelf, for one product it consumes. */
interface UnitOutflow {
  /** Positive: stock leaving per unit sold. A combo line has one per component. */
  perUnit: number;
  productId: string | null;
  unitCost: string | null;
}

/**
 * Derives each line's per-unit stock draw by **netting its existing ledger rows**
 * rather than re-reading the catalog. The movements booked against a line always
 * add up to exactly the quantity stored on it, so dividing gives the rate that
 * was actually used — which stays right after a repeat edit, and after a combo's
 * makeup or a product's cost has since changed.
 */
const loadPerUnitOutflow = async (
  gymId: string,
  lines: readonly { current: number; orderRepId: string }[]
): Promise<Map<string, UnitOutflow[]>> => {
  const byLine = new Map<string, UnitOutflow[]>();

  if (lines.length === 0) {
    return byLine;
  }

  const rows = await db
    .select({
      orderRepId: storageActionsRep.orderRepId,
      productId: storageActionsRep.productId,
      net: sql<string>`SUM(${storageActionsRep.quantity})`,
      unitCost: sql<string | null>`MAX(${storageActionsRep.unitCost})`,
    })
    .from(storageActionsRep)
    .where(
      and(
        eq(storageActionsRep.gymId, gymId),
        inArray(
          storageActionsRep.orderRepId,
          lines.map((line) => line.orderRepId)
        )
      )
    )
    .groupBy(storageActionsRep.orderRepId, storageActionsRep.productId);

  const currentByLine = new Map(
    lines.map((line) => [line.orderRepId, line.current])
  );

  for (const row of rows) {
    if (!row.orderRepId) {
      continue;
    }

    const current = currentByLine.get(row.orderRepId) ?? 0;

    // Nothing to divide by — a legacy line with no ledger rows of its own moves
    // no stock, which is better than inventing a rate for it.
    if (current <= 0) {
      continue;
    }

    const list = byLine.get(row.orderRepId) ?? [];

    list.push({
      perUnit: -toNumber(row.net) / current,
      productId: row.productId,
      unitCost: row.unitCost,
    });
    byLine.set(row.orderRepId, list);
  }

  return byLine;
};

/**
 * Books the stock a quantity change moves.
 *
 * Selling more draws the shelf down again (a `sale` row, negative). Selling less
 * always reverses the sale first (`return`, positive) — and when the goods were
 * **wasted** rather than put back, a second `waste` row takes them off again. Net
 * stock is then unchanged, which is the truth: those units are gone. Writing both
 * rows rather than none is what lets a stock report say "sold 3, reversed 3,
 * wasted 3" instead of silently swallowing the loss.
 *
 * Every row points at the adjustment that caused it, so the ledger explains itself.
 */
const writeStockDelta = async (
  tx: Transaction,
  input: {
    adjustmentId: string;
    branchId: string | null;
    /** Where the removed units went. Only meaningful when reducing. */
    disposition: RemovalDisposition | null;
    gymId: string;
    orderRepId: string;
    outflows: readonly UnitOutflow[];
    quantityDelta: number;
    time: Date;
    workerId: string;
  }
): Promise<void> => {
  const isReduction = input.quantityDelta < 0;

  const write = (
    outflow: UnitOutflow,
    movementType: string,
    quantity: number
  ) =>
    tx.insert(storageActionsRep).values({
      storageActionsRepId: nanoid(ID_LENGTH),
      gymId: input.gymId,
      branchId: input.branchId,
      productId: outflow.productId,
      actionId: null,
      orderRepId: input.orderRepId,
      adjustmentId: input.adjustmentId,
      movementType,
      quantity: quantity.toFixed(3),
      unitCost: outflow.unitCost,
      time: input.time,
      createdBy: input.workerId,
      note: null,
      seq: null,
    });

  for (const outflow of input.outflows) {
    const moved = outflow.perUnit * input.quantityDelta;

    // Below what the column can hold (3 dp) there is nothing worth recording.
    if (Math.abs(moved) < 0.0005) {
      continue;
    }

    await write(outflow, isReduction ? "return" : "sale", -moved);

    if (isReduction && input.disposition === "wasted") {
      await write(outflow, "waste", moved);
    }
  }
};

/**
 * Records *why* a line's quantity moved and books the stock it implies. The
 * adjustment row is the audit trail — the `order_items` row itself is rewritten
 * to what the sale now is, and this is what explains the difference.
 */
const writeLineAdjustment = async (
  tx: Transaction,
  input: {
    branchId: string | null;
    /** `wasted`/`returned` for a reduction, `add` when the line grew. */
    disposition: RemovalDisposition | "add";
    gymId: string;
    orderId: string;
    orderRepId: string;
    outflows: readonly UnitOutflow[];
    quantityDelta: number;
    reason: string;
    /** Money handed back — a reduction only; growing a line owes more, not less. */
    refund: number;
    time: Date;
    workerId: string;
  }
): Promise<void> => {
  const adjustmentId = nanoid(ID_LENGTH);

  await tx.insert(orderItemAdjustments).values({
    adjustmentId,
    gymId: input.gymId,
    branchId: input.branchId,
    orderRepId: input.orderRepId,
    orderId: input.orderId,
    qtyChange: input.quantityDelta,
    disposition: input.disposition,
    reason: input.reason,
    refundAmount: toMoney(input.refund),
    createdBy: input.workerId,
    createdAt: input.time,
  });

  await writeStockDelta(tx, {
    adjustmentId,
    branchId: input.branchId,
    disposition: input.disposition === "add" ? null : input.disposition,
    gymId: input.gymId,
    orderRepId: input.orderRepId,
    outflows: input.outflows,
    quantityDelta: input.quantityDelta,
    time: input.time,
    workerId: input.workerId,
  });
};

/** Takes a line off the ticket. The row survives, marked void — never deleted. */
const voidOrderLine = (
  tx: Transaction,
  input: { gymId: string; orderRepId: string; time: Date; workerId: string }
) =>
  tx
    .update(orderItems)
    .set({ status: "void", voidedAt: input.time, voidedBy: input.workerId })
    .where(
      and(
        eq(orderItems.gymId, input.gymId),
        eq(orderItems.orderRepId, input.orderRepId)
      )
    );

/** One existing line, paired with what the edit wants it to become. */
interface ResolvedLine {
  branchId: string | null;
  current: number;
  /** Where the removed units went. Always set when `next < current`. */
  disposition: RemovalDisposition | null;
  next: number;
  orderId: string;
  orderRepId: string;
  price: number;
  /** Why units came off. Always set when `next < current`. */
  reason: RemovalReason | null;
}

/** The active lines of the given orders, with what an edit needs to change them. */
const loadEditableItems = (gymId: string, orderIds: string[]) =>
  db
    .select({
      id: orderItems.orderRepId,
      orderId: orderItems.orderId,
      branchId: orderItems.branchId,
      price: orderItems.price,
      quantity: orderItems.quantity,
      lineTotal: orderItems.lineTotal,
    })
    .from(orderItems)
    .where(
      and(
        eq(orderItems.gymId, gymId),
        inArray(orderItems.orderId, orderIds),
        isNull(orderItems.voidedAt)
      )
    );

/** One line of an open order, as loaded for an edit. */
type EditableItem = Awaited<ReturnType<typeof loadEditableItems>>[number];

/**
 * Pairs each requested change with the line it targets. A line the client names
 * that is not open on this member is a stale drawer — failing beats silently
 * saving something other than what the operator was looking at.
 *
 * Losing units without saying why and where they went is refused outright: an
 * unexplained reduction is indistinguishable from theft after the fact, and the
 * disposition is what decides whether stock comes back on the shelf.
 */
const resolveEditLines = (
  itemById: Map<string, EditableItem>,
  lines: EditOrderItemsInput["lines"]
): ResolvedLine[] =>
  lines.map((line) => {
    const item = itemById.get(line.id);

    if (!item?.orderId) {
      throw new NotFoundError("Order item not found");
    }

    const current = toNumber(item.quantity);

    if (line.quantity < current && !(line.reason && line.disposition)) {
      throw new BadRequestError(
        "Removing units needs a reason and a disposition"
      );
    }

    return {
      branchId: item.branchId,
      current,
      disposition: line.disposition ?? null,
      next: line.quantity,
      orderId: item.orderId,
      orderRepId: line.id,
      price: toNumber(item.price),
      reason: line.reason ?? null,
    };
  });

/**
 * What each order comes to once the edit lands, recomputed from its surviving
 * lines rather than nudged by a delta — so the stored total can never drift from
 * the items that justify it. The line count comes along because an order left
 * with nothing on it is voided rather than stored as a zero sale.
 */
const restateOrderTotals = (
  items: readonly EditableItem[],
  nextById: Map<string, number>,
  added: { lineTotal: number }[],
  targetOrderId: string | null
): {
  lineCountByOrder: Map<string, number>;
  totalByOrder: Map<string, number>;
} => {
  const totalByOrder = new Map<string, number>();
  const lineCountByOrder = new Map<string, number>();

  const bump = (orderId: string, amount: number, lines: number) => {
    totalByOrder.set(orderId, (totalByOrder.get(orderId) ?? 0) + amount);
    lineCountByOrder.set(orderId, (lineCountByOrder.get(orderId) ?? 0) + lines);
  };

  for (const item of items) {
    const quantity = nextById.get(item.id) ?? toNumber(item.quantity);

    // Quantity zero means the operator removed the line — it contributes nothing.
    if (item.orderId && quantity > 0) {
      bump(item.orderId, toNumber(item.price) * quantity, 1);
    }
  }

  if (targetOrderId && added.length > 0) {
    bump(
      targetOrderId,
      added.reduce((sum, line) => sum + line.lineTotal, 0),
      added.length
    );
  }

  return { lineCountByOrder, totalByOrder };
};

/**
 * Lands one line's change: the row is rewritten to what the sale now is (or
 * voided outright), and the adjustment beside it records why plus the stock it
 * moves.
 */
const applyLineChange = async (
  tx: Transaction,
  input: {
    gymId: string;
    line: ResolvedLine;
    outflows: readonly UnitOutflow[];
    time: Date;
    workerId: string;
  }
): Promise<void> => {
  const { gymId, line, time, workerId } = input;

  if (line.next === 0) {
    await voidOrderLine(tx, {
      gymId,
      orderRepId: line.orderRepId,
      time,
      workerId,
    });
  } else {
    await tx
      .update(orderItems)
      .set({
        quantity: line.next,
        lineTotal: toMoney(line.price * line.next),
      })
      .where(
        and(
          eq(orderItems.gymId, gymId),
          eq(orderItems.orderRepId, line.orderRepId)
        )
      );
  }

  const delta = line.next - line.current;

  await writeLineAdjustment(tx, {
    branchId: line.branchId,
    // `resolveEditLines` guarantees both are set whenever the line lost units.
    disposition: line.disposition ?? "add",
    gymId,
    orderId: line.orderId,
    orderRepId: line.orderRepId,
    outflows: input.outflows,
    quantityDelta: delta,
    reason: line.reason ?? "edit",
    refund: Math.max(-delta, 0) * line.price,
    time,
    workerId,
  });
};

/**
 * Brings an order's own row back in line with its items. An order with nothing
 * left on it is not a zero sale — it is no sale. Otherwise a shrunken order its
 * payments now cover is settled, and one that grew past them re-opens on the
 * member's balance.
 *
 * A discount survives the edit as the figure it was: `total` arrives gross, off
 * the remaining lines, and the discount is taken off again. Recomputing the total
 * without it is what would silently chase a member for money the desk had already
 * agreed to take off. It is re-capped because an order can shrink below what was
 * discounted, and the clamped figure is written back so the row keeps saying what
 * was actually given.
 */
const restateOrderRow = (
  tx: Transaction,
  input: {
    /** What was taken off this order when it was rung up, in money. */
    discount: number;
    gymId: string;
    hasLines: boolean;
    orderId: string;
    paid: number;
    time: Date;
    /** The gross of the lines that remain — the discount has not been applied. */
    total: number;
  }
) => {
  const discount = cappedDiscount(input.total, input.discount);
  const total = input.total - discount;

  return tx
    .update(orders)
    .set({
      totalPrice: toMoney(total),
      discount: discount > 0 ? toMoney(discount) : null,
      ...(input.hasLines
        ? { settledAt: total <= input.paid + 0.005 ? input.time : null }
        : { status: "void" }),
    })
    .where(
      and(eq(orders.gymId, input.gymId), eq(orders.orderId, input.orderId))
    );
};

/**
 * Corrects a member's open orders: a line's quantity, a line removed outright,
 * and products appended to their most recent open order. Every change writes an
 * `order_item_adjustments` row and the stock movement it implies, so the ledger
 * stays the single explanation of where the goods went.
 *
 * The one thing it refuses is shrinking an order below what has already been
 * paid on it — that is money taken for goods now removed, and voiding the
 * payment first is the operator's call, not something to bury in an edit.
 */
export const editMemberOrderItems = async (
  gymId: string,
  userId: string,
  input: EditOrderItemsInput,
  workerId: string | null
): Promise<MemberOrderDetail> => {
  if (!workerId) {
    throw new UnauthorizedError("Missing x-worker-id");
  }

  const debtor = await loadDebtor(gymId, userId);
  const openOrders = await loadOpenMemberOrders(gymId, userId, debtor.type);

  if (openOrders.length === 0) {
    throw new ConflictError("No open orders to edit");
  }

  const orderIds = openOrders.map((row) => row.id);
  const itemRows = await loadEditableItems(gymId, orderIds);
  const itemById = new Map(itemRows.map((row) => [row.id, row]));

  const resolved = resolveEditLines(itemById, input.lines);
  const changed = resolved.filter((line) => line.next !== line.current);

  // Added products join the most recent open order — the tab the desk is adding
  // to — rather than opening a second ticket for the same visit.
  const target = openOrders.at(-1) ?? null;
  const addedLines =
    input.added.length > 0 ? await buildOrderLines(gymId, input.added) : [];

  const { lineCountByOrder, totalByOrder } = restateOrderTotals(
    itemRows,
    new Map(resolved.map((line) => [line.orderRepId, line.next])),
    addedLines,
    target?.id ?? null
  );

  const touched = new Set(changed.map((line) => line.orderId));

  if (target && addedLines.length > 0) {
    touched.add(target.id);
  }

  // Everything the client sent already matches what is stored — nothing to write.
  if (touched.size === 0) {
    return getMemberOrderDetail(gymId, userId);
  }

  const paidByOrder = await loadPaidByOrder(gymId, orderIds);

  /*
   * What each order was discounted by, so the edit can put it back. Read from the
   * rows already loaded rather than re-queried — and the shortfall check below
   * measures against the *discounted* total, because that is what the member owes
   * and therefore what their payments can be compared with.
   */
  const discountByOrder = new Map(
    openOrders.map((row) => [row.id, toNumber(row.discount)])
  );

  const netTotal = (orderId: string): number => {
    const gross = totalByOrder.get(orderId) ?? 0;

    return gross - cappedDiscount(gross, discountByOrder.get(orderId) ?? 0);
  };

  for (const orderId of touched) {
    // A cent of slack absorbs decimal rounding, matching checkout.
    const shortfall = (paidByOrder.get(orderId) ?? 0) - netTotal(orderId);

    if (shortfall > 0.005) {
      throw new ConflictError(
        "An order cannot total less than what has been paid on it"
      );
    }
  }

  const outflowByLine = await loadPerUnitOutflow(gymId, changed);
  const now = new Date();

  await db.transaction(async (tx) => {
    for (const line of changed) {
      await applyLineChange(tx, {
        gymId,
        line,
        outflows: outflowByLine.get(line.orderRepId) ?? [],
        time: now,
        workerId,
      });
    }

    for (const line of addedLines) {
      await insertOrderLine(tx, {
        branchId: target?.branchId ?? null,
        gymId,
        line,
        // `addedLines` is only non-empty when a target order exists.
        orderId: target?.id ?? "",
        time: now,
        workerId,
      });
    }

    for (const orderId of touched) {
      await restateOrderRow(tx, {
        discount: discountByOrder.get(orderId) ?? 0,
        gymId,
        hasLines: (lineCountByOrder.get(orderId) ?? 0) > 0,
        orderId,
        paid: paidByOrder.get(orderId) ?? 0,
        time: now,
        total: totalByOrder.get(orderId) ?? 0,
      });
    }
  });

  return getMemberOrderDetail(gymId, userId);
};

/**
 * Deletes the member's whole open balance: every unsettled order is voided, its
 * lines with it, the stock goes back on the shelf, and the payments taken
 * against those orders are voided too — so the member's debt and the day's
 * revenue both return to where they were before the sales. Nothing is erased;
 * every row survives with `void`/`voided_at` set, which is what makes it
 * auditable after the fact.
 */
export const voidMemberOrders = async (
  gymId: string,
  userId: string,
  workerId: string | null
): Promise<MemberOrderDetail> => {
  if (!workerId) {
    throw new UnauthorizedError("Missing x-worker-id");
  }

  const debtor = await loadDebtor(gymId, userId);
  const openOrders = await loadOpenMemberOrders(gymId, userId, debtor.type);

  if (openOrders.length === 0) {
    throw new ConflictError("No open orders to delete");
  }

  const orderIds = openOrders.map((row) => row.id);
  const itemRows = await loadEditableItems(gymId, orderIds);

  const outflowByLine = await loadPerUnitOutflow(
    gymId,
    itemRows.map((item) => ({
      current: toNumber(item.quantity),
      orderRepId: item.id,
    }))
  );

  const now = new Date();

  await db.transaction(async (tx) => {
    for (const item of itemRows) {
      await voidOrderLine(tx, {
        gymId,
        orderRepId: item.id,
        time: now,
        workerId,
      });

      await writeLineAdjustment(tx, {
        branchId: item.branchId,
        // Cancelling the whole sale puts the goods back — nothing was consumed.
        disposition: "returned",
        gymId,
        orderId: item.orderId ?? "",
        orderRepId: item.id,
        outflows: outflowByLine.get(item.id) ?? [],
        quantityDelta: -toNumber(item.quantity),
        reason: "order_deleted",
        refund: toNumber(item.lineTotal),
        time: now,
        workerId,
      });
    }

    await tx
      .update(income)
      .set({ voidedAt: now, voidedBy: workerId })
      .where(
        and(
          eq(income.gymId, gymId),
          eq(income.category, "order"),
          inArray(income.targetId, orderIds),
          isNull(income.voidedAt)
        )
      );

    await tx
      .update(orders)
      .set({ status: "void" })
      .where(and(eq(orders.gymId, gymId), inArray(orders.orderId, orderIds)));
  });

  return getMemberOrderDetail(gymId, userId);
};
