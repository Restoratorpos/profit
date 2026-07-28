import type { Metadata } from "next";
import { backendFetch } from "@/lib/backend";
import type { ProductListItem } from "@/lib/catalog";
import { getMessages } from "@/lib/i18n/dictionary";
import { getLocale } from "@/lib/i18n/server";
import type { InventoryItem, SupplierSummary } from "@/lib/inventory";
import { InventoryView } from "./components/inventory-view";

export const metadata: Metadata = {
  title: "Inventar",
};

const InventoryPage = async () => {
  // Independent of each other, so all are in flight at once rather than each
  // list waiting on the one before it.
  const stockPromise = backendFetch<InventoryItem[]>("/inventory");
  const suppliersPromise = backendFetch<SupplierSummary[]>("/suppliers");
  // The dialogs need units to label their quantity boxes, which the stock rows
  // carry — but a product with no movements yet must still be bookable in.
  const productsPromise = backendFetch<ProductListItem[]>("/products");
  const localePromise = getLocale();

  const [stock, suppliers, products, locale] = await Promise.all([
    stockPromise,
    suppliersPromise,
    productsPromise,
    localePromise,
  ]);

  return (
    <InventoryView
      messages={getMessages(locale)}
      products={products}
      stock={stock}
      suppliers={suppliers}
    />
  );
};

export default InventoryPage;
