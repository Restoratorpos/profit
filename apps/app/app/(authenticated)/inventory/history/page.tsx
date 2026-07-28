import type { Metadata } from "next";
import { backendFetch } from "@/lib/backend";
import { getMessages } from "@/lib/i18n/dictionary";
import { getLocale } from "@/lib/i18n/server";
import type { MovementView } from "@/lib/inventory";
import { HistoryView } from "./components/history-view";

export const metadata: Metadata = {
  title: "Harakatlar tarixi",
};

const HistoryPage = async () => {
  // The whole ledger, filtered in the browser: the movement list is bounded
  // (200 rows) and every filter on it is a field the row already carries, so a
  // round trip per filter would buy nothing.
  const movementsPromise = backendFetch<MovementView[]>(
    "/inventory/movements?limit=200"
  );
  const localePromise = getLocale();

  const [movements, locale] = await Promise.all([
    movementsPromise,
    localePromise,
  ]);

  return <HistoryView messages={getMessages(locale)} movements={movements} />;
};

export default HistoryPage;
