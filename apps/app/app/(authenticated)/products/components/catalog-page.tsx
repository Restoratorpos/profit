import { backendFetch } from "@/lib/backend";
import type {
  CategoryListItem,
  ComboListItem,
  ProductListItem,
} from "@/lib/catalog";
import { getMessages } from "@/lib/i18n/dictionary";
import { getLocale } from "@/lib/i18n/server";
import { type CatalogTab, ProductsView } from "./products-view";

/**
 * The catalog screen, for whichever of its three lists the route asked for.
 *
 * All three read the same three endpoints — a combo names its components and an
 * ingredient is counted by the combos using it, so no tab can be served by its
 * own list alone. One loader for all of them rather than three pages fetching
 * overlapping sets and drifting apart.
 */
export const CatalogPage = async ({ tab }: { tab: CatalogTab }) => {
  // Independent of each other, so all are in flight at once rather than each
  // list waiting on the one before it.
  const productsPromise = backendFetch<ProductListItem[]>("/products");
  const categoriesPromise = backendFetch<CategoryListItem[]>("/categories");
  const combosPromise = backendFetch<ComboListItem[]>("/combos");
  const localePromise = getLocale();

  const [products, categories, combos, locale] = await Promise.all([
    productsPromise,
    categoriesPromise,
    combosPromise,
    localePromise,
  ]);

  return (
    <ProductsView
      categories={categories}
      combos={combos}
      messages={getMessages(locale)}
      products={products}
      tab={tab}
    />
  );
};
