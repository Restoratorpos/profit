import type { Metadata } from "next";
import { backendFetch } from "@/lib/backend";
import { getMessages } from "@/lib/i18n/dictionary";
import { getLocale } from "@/lib/i18n/server";
import type { SupplierSummary } from "@/lib/inventory";
import { SuppliersView } from "./components/suppliers-view";

export const metadata: Metadata = {
  title: "Yetkazib beruvchilar",
};

const SuppliersPage = async () => {
  const suppliersPromise = backendFetch<SupplierSummary[]>("/suppliers");
  const localePromise = getLocale();

  const [suppliers, locale] = await Promise.all([
    suppliersPromise,
    localePromise,
  ]);

  return <SuppliersView messages={getMessages(locale)} suppliers={suppliers} />;
};

export default SuppliersPage;
