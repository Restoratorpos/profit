import type { Metadata } from "next";
import { backendFetch } from "@/lib/backend";
import type { CategoryListItem, ProductListItem } from "@/lib/catalog";
import { getMessages } from "@/lib/i18n/dictionary";
import { getLocale } from "@/lib/i18n/server";
import { ComboComposer } from "../components/combo-composer";

export const metadata: Metadata = {
  title: "Yangi to'plam",
};

const NewComboPage = async () => {
  // Independent, so both catalog lists are in flight at once.
  const productsPromise = backendFetch<ProductListItem[]>("/products");
  const categoriesPromise = backendFetch<CategoryListItem[]>("/categories");
  const localePromise = getLocale();

  const [products, categories, locale] = await Promise.all([
    productsPromise,
    categoriesPromise,
    localePromise,
  ]);

  return (
    <ComboComposer
      categories={categories}
      messages={getMessages(locale)}
      products={products}
    />
  );
};

export default NewComboPage;
