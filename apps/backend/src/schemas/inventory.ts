import { z } from "zod";
import { STOCK_ACTION_TYPES } from "../db/schema.js";

/**
 * The stock document the desk raises from the Amallar menu. All four types
 * write the same header plus signed ledger rows; what differs is the sign, and
 * whether money is involved at all — see `storageActionsMain` in db/schema.ts.
 */

const money = z.coerce
  .number()
  .min(0, "Cannot be negative")
  .max(999_999_999_999.99, "Too large for the column")
  .transform((value) => value.toFixed(2));

/**
 * Quantities carry three decimals because stock does: 0.250 kg of coffee is a
 * normal delivery line. Signed rather than unsigned — a stocktake correction is
 * the one case where the desk genuinely means "there are 2 fewer than recorded".
 */
const quantity = z.coerce
  .number()
  .refine(Number.isFinite, "Must be a number")
  .max(99_999_999, "Too large for the column")
  .min(-99_999_999, "Too large for the column")
  .transform((value) => value.toFixed(3));

const positiveQuantity = z.coerce
  .number()
  .positive("Must be greater than zero")
  .max(99_999_999, "Too large for the column")
  .transform((value) => value.toFixed(3));

/** How a supplier payment left the till. Mirrors `expenses.method`. */
export const EXPENSE_METHODS = ["cash", "card", "transfer"] as const;

export type ExpenseMethod = (typeof EXPENSE_METHODS)[number];

/**
 * A line on a delivery. `unitCost` is what this delivery paid per unit — kept
 * per line rather than read from the product, because the whole reason to record
 * a delivery is that the price changed.
 */
const stockLineSchema = z.object({
  productId: z.string().trim().min(1).max(20),
  quantity: positiveQuantity,
  unitCost: money.optional(),
});

/**
 * A stocktake counts, it does not move: the desk types what is physically on the
 * shelf and the service works out the correction. `counted` is therefore an
 * absolute quantity, never a delta — which is exactly why it is a separate shape
 * from the line above rather than a signed reuse of it.
 */
const stocktakeLineSchema = z.object({
  counted: quantity,
  productId: z.string().trim().min(1).max(20),
});

/**
 * Kirim / Yaroqsiz / Qaytarish. A delivery may name a supplier and may be paid
 * on the spot; a write-off never has either — the service rejects the
 * combination rather than silently dropping it, because a write-off that quietly
 * booked a payment would be a hole in the books.
 */
export const createStockActionSchema = z.object({
  actionType: z.enum(["in", "writeoff", "return"] as const),
  description: z.string().trim().max(64).nullish(),
  items: z.array(stockLineSchema).min(1, "Add at least one product"),
  note: z.string().trim().max(255).nullish(),
  /** Paid at the moment of delivery; omitted or 0 leaves the whole lot owing. */
  paidAmount: money.optional(),
  paymentMethod: z.enum(EXPENSE_METHODS).optional(),
  supplierId: z.string().trim().max(16).nullish(),
});

export type CreateStockActionInput = z.infer<typeof createStockActionSchema>;

/** Inventarizatsiya: the counted truth, per product. */
export const createStocktakeSchema = z.object({
  description: z.string().trim().max(64).nullish(),
  items: z.array(stocktakeLineSchema).min(1, "Count at least one product"),
  note: z.string().trim().max(255).nullish(),
});

export type CreateStocktakeInput = z.infer<typeof createStocktakeSchema>;

export const createSupplierSchema = z.object({
  description: z.string().trim().max(2000).nullish(),
  passport: z.string().trim().max(32).nullish(),
  phone: z.string().trim().max(50).nullish(),
  supplier: z.string().trim().min(1, "Name is required").max(255),
  supplierType: z.string().trim().max(32).nullish(),
});

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;

export const updateSupplierSchema = createSupplierSchema.partial();

export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;

/**
 * Paying a supplier settles their whole outstanding balance, not one delivery —
 * the same one-figure-one-box model the member debt screen uses. The amount is
 * applied to their oldest unpaid deliveries first; see inventory.service.
 */
export const paySupplierSchema = z.object({
  amount: z.coerce
    .number()
    .positive("Must be greater than zero")
    .max(999_999_999_999.99, "Too large for the column")
    .transform((value) => value.toFixed(2)),
  method: z.enum(EXPENSE_METHODS),
  note: z.string().trim().max(255).nullish(),
});

export type PaySupplierInput = z.infer<typeof paySupplierSchema>;

/** Reading the ledger back. Everything is optional — the default is "all". */
export const movementQuerySchema = z.object({
  actionType: z.enum(STOCK_ACTION_TYPES).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  productId: z.string().trim().max(20).optional(),
});

export type MovementQuery = z.infer<typeof movementQuerySchema>;
