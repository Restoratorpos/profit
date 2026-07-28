import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { backendFetch } from "@/lib/backend";
import type {
  CategoryListItem,
  ComboListItem,
  ProductListItem,
} from "@/lib/catalog";
import { getMessages } from "@/lib/i18n/dictionary";
import { getLocale } from "@/lib/i18n/server";
import { ComboComposer } from "../components/combo-composer";

export const metadata: Metadata = {
  title: "To'plam",
};

const EditComboPage = async ({
  params,
}: {
  params: Promise<{ comboId: string }>;
}) => {
  const { comboId } = await params;

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

  const combo = combos.find((row) => row.id === comboId);

  if (!combo) {
    notFound();
  }

  return (
    <ComboComposer
      categories={categories}
      combo={combo}
      messages={getMessages(locale)}
      products={products}
    />
  );
};

export default EditComboPage;
