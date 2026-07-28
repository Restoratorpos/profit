import type { Metadata } from "next";
import { backendFetch } from "@/lib/backend";
import type { ComboListItem, ProductListItem } from "@/lib/catalog";
import { getMessages } from "@/lib/i18n/dictionary";
import { getLocale } from "@/lib/i18n/server";
import { type MemberOrderSummary, toPosProducts } from "@/lib/orders";
import { OrdersView } from "./components/orders-view";

export const metadata: Metadata = {
  title: "Buyurtmalar",
};

const OrdersPage = async () => {
  const ordersPromise = backendFetch<MemberOrderSummary[]>("/orders");
  // The edit sheet's "Add product" picker needs the catalog. Fetched with the
  // list rather than on open, so the sheet has nothing to wait for.
  const productsPromise = backendFetch<ProductListItem[]>("/products");
  const combosPromise = backendFetch<ComboListItem[]>("/combos");
  const localePromise = getLocale();

  const [orders, products, combos, locale] = await Promise.all([
    ordersPromise,
    productsPromise,
    combosPromise,
    localePromise,
  ]);

  return (
    <OrdersView
      locale={locale}
      messages={getMessages(locale)}
      products={toPosProducts(products, combos)}
      summaries={orders}
    />
  );
};

export default OrdersPage;
