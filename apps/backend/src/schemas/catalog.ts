import { z } from "zod";

/**
 * `products.product_type` is a free-form varchar(64) in SQL. The set lives here
 * so the API is the thing that decides what is valid, not each caller.
 *
 * "shop" and "bar" are the two sellable sides of the catalog. **"ingredient" is
 * not sellable** — it is a raw material (milk, syrup, protein powder) that
 * exists only to be consumed inside a combo, so it carries a cost and a unit but
 * no meaningful sale price and never reaches the POS grid. It rides on
 * `product_type` rather than a new table because combo components already point
 * at `products.product_id`; a separate table would need its own join in every
 * combo query and a migration against a shared remote database.
 */
export const PRODUCT_TYPES = ["shop", "bar", "ingredient"] as const;

/** Money arrives as a string or a number and is stored as DECIMAL. */
const money = z.coerce
  .number()
  .min(0, "Cannot be negative")
  .max(99_999_999.99, "Too large for the column")
  // Back to a fixed-precision string so no float rounding reaches the database.
  .transform((value) => value.toFixed(2));

/** A `#rrggbb` tile background, or null for none. Validated, not free varchar. */
const color = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Expected a hex colour like #2563eb")
  .nullish();

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(120),
  color,
});

export const updateCategorySchema = createCategorySchema;

const name = z.string().trim().min(1).max(100);
const productType = z.enum(PRODUCT_TYPES);
const categoryId = z.string().trim().max(16).nullish();
const unit = z.string().trim().max(64).nullish();
const description = z.string().trim().max(124).nullish();

export const createProductSchema = z.object({
  name,
  productType: productType.default("shop"),
  categoryId,
  price: money,
  cost: money,
  unit,
  description,
  color,
});

/**
 * Every field optional, but at least one must be present.
 *
 * Deliberately NOT `createProductSchema.partial()`: `.partial()` makes a field
 * optional but leaves its `.default()` intact, so an empty body would parse to
 * `{ productType: "shop" }` — passing the "at least one field" check and
 * silently rewriting the product's type on every no-op update.
 */
export const updateProductSchema = z
  .object({
    name: name.optional(),
    productType: productType.optional(),
    categoryId,
    price: money.optional(),
    cost: money.optional(),
    unit,
    description,
    color,
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "Provide at least one field to update"
  );

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
