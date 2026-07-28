import { z } from "zod";

/**
 * A combo belongs to one side of the catalog, exactly like a product — the same
 * `product_type` vocabulary minus "ingredient", because a combo is always sold.
 * Its components, though, may be drawn from any side, ingredients included:
 * that is the point of an ingredient, and it is what makes a bar drink costable
 * from milk and syrup rather than from other sellable products.
 */
export const COMBO_TYPES = ["shop", "bar"] as const;

/** Money arrives as a string or number and is stored as DECIMAL(10,2). */
const money = z.coerce
  .number()
  .min(0, "Cannot be negative")
  .max(99_999_999.99, "Too large for the column")
  .transform((value) => value.toFixed(2));

/**
 * How much of a product goes into the combo, in the product's own unit — 0.05
 * for 50 g of a per-kg product. The column is DECIMAL(10,2), so it is pinned to
 * two places; anything finer is rounded before it reaches the database.
 */
const quantity = z.coerce
  .number()
  .positive("Must be greater than zero")
  .max(99_999_999.99, "Too large for the column")
  .transform((value) => value.toFixed(2));

const componentSchema = z.object({
  productId: z.string().trim().min(1).max(20),
  quantity,
});

/**
 * Creating a combo carries its whole makeup in one body: the header (name,
 * price, type, category) and every component. Editing replaces the same shape
 * wholesale rather than diffing rows, so both share this schema.
 */
export const createComboSchema = z.object({
  name: z.string().trim().min(1).max(255),
  price: money,
  productType: z.enum(COMBO_TYPES).default("shop"),
  categoryId: z.string().trim().max(16).nullish(),
  components: z
    .array(componentSchema)
    .min(1, "A combo needs at least one product"),
});

export const updateComboSchema = createComboSchema;

export type ComboComponentInput = z.infer<typeof componentSchema>;
export type CreateComboInput = z.infer<typeof createComboSchema>;
export type UpdateComboInput = z.infer<typeof updateComboSchema>;
