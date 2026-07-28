import { and, asc, eq, ne } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db/index.js";
import {
  type Category,
  categories,
  ID_LENGTH,
  type Product,
  products,
  SHORT_ID_LENGTH,
} from "../db/schema.js";
import { ConflictError, NotFoundError } from "../lib/errors.js";
import type {
  CreateCategoryInput,
  CreateProductInput,
  UpdateCategoryInput,
  UpdateProductInput,
} from "../schemas/catalog.js";

/**
 * Every function here takes `gymId` as its first argument, and every query
 * filters by it. The database declares no foreign keys and no tenant
 * constraints, so this layer is the only thing standing between one gym and
 * another's data — an unscoped query is a data leak, not a bug to fix later.
 */

/** A product with its category name resolved, which is what the table renders. */
export interface ProductListItem {
  categoryId: string | null;
  categoryName: string | null;
  color: string | null;
  cost: string | null;
  id: string;
  isActive: boolean;
  name: string;
  price: string | null;
  productType: string | null;
  unit: string | null;
}

export interface CategoryListItem {
  color: string | null;
  id: string;
  name: string;
}

const toCategoryItem = (row: Category): CategoryListItem => ({
  id: row.categoryId,
  name: row.category ?? "",
  color: row.color ?? null,
});

export const listCategories = async (
  gymId: string
): Promise<CategoryListItem[]> => {
  const rows = await db
    .select()
    .from(categories)
    .where(eq(categories.gymId, gymId))
    .orderBy(asc(categories.category));

  return rows.map(toCategoryItem);
};

export const createCategory = async (
  gymId: string,
  { name, color }: CreateCategoryInput
): Promise<CategoryListItem> => {
  const existing = await db
    .select({ categoryId: categories.categoryId })
    .from(categories)
    .where(and(eq(categories.gymId, gymId), eq(categories.category, name)))
    .limit(1);

  if (existing.length > 0) {
    throw new ConflictError("A category with this name already exists");
  }

  const row: Category = {
    categoryId: nanoid(SHORT_ID_LENGTH),
    gymId,
    category: name,
    createdAt: new Date(),
    color: color ?? null,
  };

  await db.insert(categories).values(row);

  return toCategoryItem(row);
};

/**
 * Existence is checked with a SELECT rather than by reading affectedRows.
 *
 * MySQL reports affectedRows as rows *changed*, not rows matched — so renaming
 * something to the value it already has returns 0, which would otherwise be
 * indistinguishable from "no such row" and surface as a bogus 404 on a harmless
 * no-op save.
 */
const assertCategoryExists = async (
  gymId: string,
  categoryId: string
): Promise<void> => {
  const [row] = await db
    .select({ categoryId: categories.categoryId })
    .from(categories)
    .where(
      and(eq(categories.gymId, gymId), eq(categories.categoryId, categoryId))
    )
    .limit(1);

  if (!row) {
    throw new NotFoundError("Category not found");
  }
};

export const updateCategory = async (
  gymId: string,
  categoryId: string,
  { name, color }: UpdateCategoryInput
): Promise<CategoryListItem> => {
  await assertCategoryExists(gymId, categoryId);

  const [clash] = await db
    .select({ categoryId: categories.categoryId })
    .from(categories)
    .where(
      and(
        eq(categories.gymId, gymId),
        eq(categories.category, name),
        ne(categories.categoryId, categoryId)
      )
    )
    .limit(1);

  if (clash) {
    throw new ConflictError("A category with this name already exists");
  }

  await db
    .update(categories)
    .set({
      category: name,
      // Only touch the colour when the caller sent one — the inline rename flow
      // omits it, and setting `null` there would silently wipe the tile colour.
      ...(color === undefined ? {} : { color: color ?? null }),
    })
    .where(
      and(eq(categories.gymId, gymId), eq(categories.categoryId, categoryId))
    );

  const [row] = await db
    .select()
    .from(categories)
    .where(
      and(eq(categories.gymId, gymId), eq(categories.categoryId, categoryId))
    )
    .limit(1);

  return row ? toCategoryItem(row) : { id: categoryId, name, color: null };
};

export const deleteCategory = async (
  gymId: string,
  categoryId: string
): Promise<void> => {
  // Scoped by gym as well as id: without it, any id from any tenant would delete.
  const result = await db
    .delete(categories)
    .where(
      and(eq(categories.gymId, gymId), eq(categories.categoryId, categoryId))
    );

  if (result[0].affectedRows === 0) {
    throw new NotFoundError("Category not found");
  }

  // Products keep their category_id column but it now points at nothing, so
  // clear it rather than leaving rows referencing a deleted row.
  await db
    .update(products)
    .set({ categoryId: null })
    .where(and(eq(products.gymId, gymId), eq(products.categoryId, categoryId)));
};

export const listProducts = async (
  gymId: string
): Promise<ProductListItem[]> => {
  // Left join: a product without a category still belongs in the list.
  const rows = await db
    .select({
      product: products,
      categoryName: categories.category,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.categoryId))
    .where(eq(products.gymId, gymId))
    .orderBy(asc(products.product));

  return rows.map(({ product, categoryName }) => ({
    id: product.productId,
    name: product.product ?? "",
    productType: product.productType,
    categoryId: product.categoryId,
    categoryName,
    price: product.price,
    cost: product.cost,
    unit: product.unit,
    color: product.color ?? null,
    isActive: product.isActive ?? true,
  }));
};

/** Refuses a category from another gym rather than silently storing it. */
const assertCategoryBelongsToGym = async (
  gymId: string,
  categoryId: string
): Promise<void> => {
  const [row] = await db
    .select({ categoryId: categories.categoryId })
    .from(categories)
    .where(
      and(eq(categories.gymId, gymId), eq(categories.categoryId, categoryId))
    )
    .limit(1);

  if (!row) {
    throw new NotFoundError("Category not found");
  }
};

export const createProduct = async (
  gymId: string,
  input: CreateProductInput
): Promise<ProductListItem> => {
  if (input.categoryId) {
    await assertCategoryBelongsToGym(gymId, input.categoryId);
  }

  const row: Product = {
    productId: nanoid(ID_LENGTH),
    gymId,
    product: input.name,
    productType: input.productType,
    description: input.description ?? null,
    price: input.price,
    cost: input.cost,
    unit: input.unit ?? null,
    lowStockThreshold: null,
    isActive: true,
    createdAt: new Date(),
    categoryId: input.categoryId ?? null,
    color: input.color ?? null,
  };

  await db.insert(products).values(row);

  const [category] = input.categoryId
    ? await db
        .select({ name: categories.category })
        .from(categories)
        .where(eq(categories.categoryId, input.categoryId))
        .limit(1)
    : [];

  return {
    id: row.productId,
    name: input.name,
    productType: input.productType,
    categoryId: row.categoryId,
    categoryName: category?.name ?? null,
    price: row.price,
    cost: row.cost,
    unit: row.unit,
    color: row.color,
    isActive: true,
  };
};

export const updateProduct = async (
  gymId: string,
  productId: string,
  input: UpdateProductInput
): Promise<void> => {
  if (input.categoryId) {
    await assertCategoryBelongsToGym(gymId, input.categoryId);
  }

  // Same reason as assertCategoryExists: affectedRows counts *changed* rows, so
  // re-saving a product without editing anything would look like a 404.
  const [existing] = await db
    .select({ productId: products.productId })
    .from(products)
    .where(and(eq(products.gymId, gymId), eq(products.productId, productId)))
    .limit(1);

  if (!existing) {
    throw new NotFoundError("Product not found");
  }

  await db
    .update(products)
    .set({
      ...(input.name === undefined ? {} : { product: input.name }),
      ...(input.productType === undefined
        ? {}
        : { productType: input.productType }),
      ...(input.categoryId === undefined
        ? {}
        : { categoryId: input.categoryId ?? null }),
      ...(input.price === undefined ? {} : { price: input.price }),
      ...(input.cost === undefined ? {} : { cost: input.cost }),
      ...(input.unit === undefined ? {} : { unit: input.unit ?? null }),
      ...(input.description === undefined
        ? {}
        : { description: input.description ?? null }),
      ...(input.color === undefined ? {} : { color: input.color ?? null }),
    })
    .where(and(eq(products.gymId, gymId), eq(products.productId, productId)));
};

export const deleteProduct = async (
  gymId: string,
  productId: string
): Promise<void> => {
  const result = await db
    .delete(products)
    .where(and(eq(products.gymId, gymId), eq(products.productId, productId)));

  if (result[0].affectedRows === 0) {
    throw new NotFoundError("Product not found");
  }
};
