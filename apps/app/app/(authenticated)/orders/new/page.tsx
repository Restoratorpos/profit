import type { Metadata } from "next";
import { backendFetch } from "@/lib/backend";
import type { ComboListItem, ProductListItem } from "@/lib/catalog";
import { getMessages } from "@/lib/i18n/dictionary";
import { getLocale } from "@/lib/i18n/server";
import type { MemberListItem } from "@/lib/members";
import { type OrderCustomer, toPosProducts } from "@/lib/orders";
import { OrderComposer } from "./components/order-composer";

export const metadata: Metadata = {
  title: "Yangi buyurtma",
};

const NewOrderPage = async () => {
  const productsPromise = backendFetch<ProductListItem[]>("/products");
  const combosPromise = backendFetch<ComboListItem[]>("/combos");
  const membersPromise = backendFetch<MemberListItem[]>("/members");
  const localePromise = getLocale();

  const [products, combos, members, locale] = await Promise.all([
    productsPromise,
    combosPromise,
    membersPromise,
    localePromise,
  ]);

  const customers: OrderCustomer[] = members.map((member) => ({
    id: member.id,
    name: member.name,
    phone: member.phone,
  }));

  return (
    <OrderComposer
      customers={customers}
      messages={getMessages(locale)}
      products={toPosProducts(products, combos)}
    />
  );
};

export default NewOrderPage;
