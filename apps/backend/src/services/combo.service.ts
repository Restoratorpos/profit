import { and, asc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db/index.js";
import {
  categories,
  comboComponents,
  combos,
  products,
  SHORT_ID_LENGTH,
} from "../db/schema.js";
import { BadRequestError, NotFoundError } from "../lib/errors.js";
import type { CreateComboInput, UpdateComboInput } from "../schemas/combo.js";

/** Every query filters by gymId. An unscoped one is a data leak, not a bug. */

/** One product inside a combo, resolved against the catalog for its numbers. */
export interface ComboComponentView {
  cost: string;
  /** The component's cost contribution: product cost × quantity. */
  lineCost: string;
  name: string;
  price: string;
  productId: string;
  quantity: string;
  unit: string | null;
}

export interface ComboListItem {
  categoryId: string | null;
  categoryName: string | null;
  components: ComboComponentView[];
  /** Tannarx: Σ(product.cost × quantity) across the components. */
  cost: string;
  id: string;
  name: string;
  /** The combo's own sale price. */
  price: string;
  productType: string | null;
  /** Foyda: the sale price minus the assembled cost, floored at zero. */
  profit: string;
}

const toMoney = (value: number): string => value.toFixed(2);

const toNumber = (value: string | number | null): number => {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Combo components carry no gym_id of their own — they are reachable only
 * through their combo. So every read starts from the gym's combos and pulls the
 * components for those ids, and every write gates on the combo's ownership
 * first. That combo→gym check is the only thing standing between tenants here.
 */
const buildComponentViews = (
  rows: {
    productId: string | null;
    quantity: string | null;
    name: string | null;
    price: string | null;
    cost: string | null;
    unit: string | null;
  }[]
): { components: ComboComponentView[]; cost: number } => {
  let cost = 0;
  const components: ComboComponentView[] = [];

  for (const row of rows) {
    const qty = toNumber(row.quantity);
    const lineCost = toNumber(row.cost) * qty;

    cost += lineCost;
    components.push({
      productId: row.productId ?? "",
      // A component whose product was deleted still lists, valued at zero, so a
      // stale combo is visible and fixable rather than silently dropping a line.
      name: row.name ?? "",
      quantity: toMoney(qty),
      unit: row.unit,
      price: toMoney(toNumber(row.price)),
      cost: toMoney(toNumber(row.cost)),
      lineCost: toMoney(lineCost),
    });
  }

  return { components, cost };
};

export const listCombos = async (gymId: string): Promise<ComboListItem[]> => {
  const comboRows = await db
    .select({
      id: combos.comboId,
      name: combos.combo,
      price: combos.price,
      productType: combos.productType,
      categoryId: combos.categoryId,
      categoryName: categories.category,
    })
    .from(combos)
    .leftJoin(categories, eq(combos.categoryId, categories.categoryId))
    .where(eq(combos.gymId, gymId))
    .orderBy(asc(combos.combo));

  if (comboRows.length === 0) {
    return [];
  }

  const comboIds = comboRows.map((row) => row.id);

  const componentRows = await db
    .select({
      comboId: comboComponents.comboId,
      productId: comboComponents.productId,
      quantity: comboComponents.quantity,
      name: products.product,
      price: products.price,
      cost: products.cost,
      unit: products.unit,
    })
    .from(comboComponents)
    .leftJoin(products, eq(comboComponents.productId, products.productId))
    .where(inArray(comboComponents.comboId, comboIds));

  const rowsByCombo = new Map<string, typeof componentRows>();

  for (const row of componentRows) {
    if (!row.comboId) {
      continue;
    }

    const list = rowsByCombo.get(row.comboId) ?? [];

    list.push(row);
    rowsByCombo.set(row.comboId, list);
  }

  return comboRows.map((combo) => {
    const { components, cost } = buildComponentViews(
      rowsByCombo.get(combo.id) ?? []
    );
    const price = toNumber(combo.price);

    return {
      id: combo.id,
      name: combo.name ?? "",
      productType: combo.productType,
      categoryId: combo.categoryId,
      categoryName: combo.categoryName,
      price: toMoney(price),
      cost: toMoney(cost),
      profit: toMoney(Math.max(price - cost, 0)),
      components,
    };
  });
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

/**
 * Every referenced product must belong to this gym — otherwise a combo could
 * quietly point at another tenant's catalog. Returns nothing; it only guards.
 */
const assertProductsBelongToGym = async (
  gymId: string,
  productIds: string[]
): Promise<void> => {
  const rows = await db
    .select({ id: products.productId })
    .from(products)
    .where(
      and(eq(products.gymId, gymId), inArray(products.productId, productIds))
    );

  if (rows.length !== productIds.length) {
    throw new BadRequestError("A product in this combo does not exist");
  }
};

const componentValues = (
  comboId: string,
  input: CreateComboInput
): { comboId: string; productId: string; quantity: string }[] =>
  input.components.map((component) => ({
    comboId,
    productId: component.productId,
    quantity: component.quantity,
  }));

const findCombo = async (
  gymId: string,
  comboId: string
): Promise<ComboListItem> => {
  const [combo] = (await listCombos(gymId)).filter((row) => row.id === comboId);

  if (!combo) {
    throw new NotFoundError("Combo not found");
  }

  return combo;
};

export const createCombo = async (
  gymId: string,
  input: CreateComboInput
): Promise<ComboListItem> => {
  if (input.categoryId) {
    await assertCategoryBelongsToGym(gymId, input.categoryId);
  }

  const productIds = [...new Set(input.components.map((c) => c.productId))];

  await assertProductsBelongToGym(gymId, productIds);

  const comboId = nanoid(SHORT_ID_LENGTH);

  await db.transaction(async (tx) => {
    await tx.insert(combos).values({
      comboId,
      gymId,
      combo: input.name,
      price: input.price,
      createdAt: new Date(),
      productType: input.productType,
      categoryId: input.categoryId ?? null,
    });

    // `combo_components.id` is a DB auto-increment — never set here.
    await tx.insert(comboComponents).values(componentValues(comboId, input));
  });

  return findCombo(gymId, comboId);
};

const assertComboExists = async (
  gymId: string,
  comboId: string
): Promise<void> => {
  const [row] = await db
    .select({ comboId: combos.comboId })
    .from(combos)
    .where(and(eq(combos.gymId, gymId), eq(combos.comboId, comboId)))
    .limit(1);

  if (!row) {
    throw new NotFoundError("Combo not found");
  }
};

export const updateCombo = async (
  gymId: string,
  comboId: string,
  input: UpdateComboInput
): Promise<ComboListItem> => {
  await assertComboExists(gymId, comboId);

  if (input.categoryId) {
    await assertCategoryBelongsToGym(gymId, input.categoryId);
  }

  const productIds = [...new Set(input.components.map((c) => c.productId))];

  await assertProductsBelongToGym(gymId, productIds);

  await db.transaction(async (tx) => {
    await tx
      .update(combos)
      .set({
        combo: input.name,
        price: input.price,
        productType: input.productType,
        categoryId: input.categoryId ?? null,
      })
      .where(and(eq(combos.gymId, gymId), eq(combos.comboId, comboId)));

    // Components are replaced wholesale — simpler and race-free next to diffing,
    // and safe because the combo's ownership was already asserted above.
    await tx
      .delete(comboComponents)
      .where(eq(comboComponents.comboId, comboId));

    await tx.insert(comboComponents).values(componentValues(comboId, input));
  });

  return findCombo(gymId, comboId);
};

export const deleteCombo = async (
  gymId: string,
  comboId: string
): Promise<void> => {
  const result = await db
    .delete(combos)
    .where(and(eq(combos.gymId, gymId), eq(combos.comboId, comboId)));

  if (result[0].affectedRows === 0) {
    throw new NotFoundError("Combo not found");
  }

  // No gym_id on the components: they are cleared by the now-verified combo id.
  await db.delete(comboComponents).where(eq(comboComponents.comboId, comboId));
};
