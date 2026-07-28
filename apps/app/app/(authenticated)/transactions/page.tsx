import type { Metadata } from "next";
import { backendFetch } from "@/lib/backend";
import { getMessages } from "@/lib/i18n/dictionary";
import { getLocale } from "@/lib/i18n/server";
import type { TransactionPage, TransactionParties } from "@/lib/transactions";
import { TransactionsView } from "./components/transactions-view";

export const metadata: Metadata = {
  title: "Tranzaksiyalar",
};

/**
 * Three independent reads, so all three start before any of them is awaited —
 * the parties list does not depend on the ledger and the locale depends on
 * neither.
 */
const TransactionsPage = async () => {
  const pagePromise = backendFetch<TransactionPage>("/transactions?limit=50");
  const partiesPromise = backendFetch<TransactionParties>(
    "/transactions/parties"
  );
  const localePromise = getLocale();

  const [page, parties, locale] = await Promise.all([
    pagePromise,
    partiesPromise,
    localePromise,
  ]);

  return (
    <TransactionsView
      initial={page}
      messages={getMessages(locale)}
      parties={parties}
    />
  );
};

export default TransactionsPage;
