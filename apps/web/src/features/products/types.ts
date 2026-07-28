/** Mirrors the shapes apps/backend returns from /products and /categories. */

/**
 * What a Server Action hands back to a form. It lives here rather than beside
 * the actions because a "use server" module may only export async functions.
 */
export interface ProductListItem {
  categoryId: string | null;
  categoryName: string | null;
  /** Hex tile background like "#2563eb", or null for the default. */
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

/** One product inside a combo, resolved against the catalog for its numbers. */
export interface ComboComponentView {
  cost: string;
  /** product cost × quantity — this line's share of the combo's Tannarx. */
  lineCost: string;
  name: string;
  price: string;
  productId: string;
  /** In the product's own unit — "0.05" for 50 g of a per-kg product. */
  quantity: string;
  unit: string | null;
}

/** Mirrors what apps/backend returns from /combos. */
export interface ComboListItem {
  categoryId: string | null;
  categoryName: string | null;
  components: ComboComponentView[];
  /** Tannarx: Σ(component cost). */
  cost: string;
  id: string;
  name: string;
  /** The combo's own sale price. */
  price: string;
  productType: string | null;
  /** Foyda: sale price − Tannarx, floored at zero. */
  profit: string;
}

/**
 * The fixed swatch set for a product/category tile background — the same row of
 * dots the desk picks from. Blue is the default when nothing is chosen.
 */
export const PRODUCT_COLORS = [
  "#7f1d1d",
  "#be185d",
  "#dc2626",
  "#ea580c",
  "#f59e0b",
  "#eab308",
  "#78350f",
  "#b45309",
  "#9ca3af",
  "#22c55e",
  "#16a34a",
  "#15803d",
  "#2563eb",
  "#3b82f6",
  "#38bdf8",
  "#7c3aed",
  "#8b5cf6",
  "#c4b5fd",
] as const;

export const DEFAULT_PRODUCT_COLOR = "#2563eb";

/**
 * Black or white text, whichever is legible on `hex`. Uses the WCAG relative
 * luminance so a light swatch gets dark text and a dark one gets light — never a
 * fixed colour that vanishes on half the palette.
 */
export const readableTextOn = (hex: string): "#000000" | "#ffffff" => {
  const value = hex.replace("#", "");

  if (value.length !== 6) {
    return "#ffffff";
  }

  const toLinear = (channel: number): number => {
    const c = channel / 255;

    return c <= 0.039_28 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };

  const r = toLinear(Number.parseInt(value.slice(0, 2), 16));
  const g = toLinear(Number.parseInt(value.slice(2, 4), 16));
  const b = toLinear(Number.parseInt(value.slice(4, 6), 16));
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

  return luminance > 0.4 ? "#000000" : "#ffffff";
};

/**
 * Mirrors `PRODUCT_TYPES` in apps/backend. "shop" and "bar" are the two sellable
 * sides of the catalog; "ingredient" is a raw material — it has a cost and a
 * unit but no sale price, never reaches the POS, and exists to be consumed
 * inside a combo.
 */
export const PRODUCT_TYPES = ["shop", "bar", "ingredient"] as const;

export type ProductType = (typeof PRODUCT_TYPES)[number];

export const INGREDIENT_TYPE = "ingredient";

export const isIngredient = (product: {
  productType: string | null;
}): boolean => product.productType === INGREDIENT_TYPE;

/**
 * The per-unit money that means something for this item. An ingredient is never
 * sold, so its price column is a meaningless zero and its cost is the number
 * that matters — combo lines are valued off this, not off `price`.
 */
export const unitValueOf = (product: ProductListItem): number => {
  const value = Number(
    (isIngredient(product) ? product.cost : product.price) ?? 0
  );

  return Number.isFinite(value) ? value : 0;
};

/**
 * Margin as a percentage of the sale price, or null when it cannot be computed —
 * a missing side, or a giveaway priced at zero. Percent rather than absolute
 * money because it is the number that makes two differently-priced rows
 * comparable at a glance. Takes the two values rather than a row so combos,
 * which carry the same pair under different names, share one definition.
 */
export const marginPercent = (
  price: string | null,
  cost: string | null
): number | null => {
  if (price === null || cost === null) {
    return null;
  }

  const priceValue = Number(price);
  const costValue = Number(cost);

  if (
    !(Number.isFinite(priceValue) && Number.isFinite(costValue)) ||
    priceValue <= 0
  ) {
    return null;
  }

  return ((priceValue - costValue) / priceValue) * 100;
};

/** A combo one product feeds — enough to name it and key a row by it. */
export interface ComboUsage {
  id: string;
  name: string;
}

/**
 * Which combos each product appears in, keyed by product id. Built from the
 * combo list the page already holds, so it needs no extra endpoint. Names
 * rather than a count: an ingredient's whole reason to exist is to be used
 * somewhere, and "used in 2" only says whether to worry, while "Latte,
 * Kapuchino" says what to go and check before changing its cost or deleting it.
 */
export const comboUsageByProductId = (
  combos: readonly ComboListItem[]
): Map<string, ComboUsage[]> => {
  const usage = new Map<string, ComboUsage[]>();

  for (const combo of combos) {
    // A combo listing the same product twice is still one combo for it.
    const seen = new Set<string>();

    for (const component of combo.components) {
      if (seen.has(component.productId)) {
        continue;
      }

      seen.add(component.productId);

      const used = usage.get(component.productId);

      if (used) {
        used.push({ id: combo.id, name: combo.name });
      } else {
        usage.set(component.productId, [{ id: combo.id, name: combo.name }]);
      }
    }
  }

  return usage;
};

/** createCategoryAction hands the new row back so a picker can select it. */
export interface CreateCategoryResult {
  category?: CategoryListItem;
  error?: string;
  ok: boolean;
}

/**
 * Units are free text on the product, so the pickable list is whatever the gym
 * has already used. No extra endpoint: the page already holds every product.
 */
export const unitsFrom = (products: readonly ProductListItem[]): string[] => {
  const seen = new Set<string>();

  for (const product of products) {
    const unit = product.unit?.trim();

    if (unit) {
      seen.add(unit);
    }
  }

  return [...seen].sort((a, b) => a.localeCompare(b));
};

/**
 * Profit is derived, never stored — the same rule the schema applies to debt.
 * Null if either side is missing, so the table shows a dash rather than a
 * confident zero.
 */
export const profitOf = (product: ProductListItem): string | null => {
  if (product.price === null || product.cost === null) {
    return null;
  }

  const price = Number(product.price);
  const cost = Number(product.cost);

  return Number.isFinite(price) && Number.isFinite(cost)
    ? (price - cost).toFixed(2)
    : null;
};
