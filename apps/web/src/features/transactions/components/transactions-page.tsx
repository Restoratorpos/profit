import { Spinner } from "@repo/design-system/components/ui/spinner";
import { useState } from "react";
import { useLocale } from "@/lib/i18n/provider";
import { useLedger, useParties } from "../api";
import { DEFAULT_LEDGER_FILTER, type LedgerFilter } from "../types";
import { TransactionsView } from "./transactions-view";

/**
 * What `app/(authenticated)/transactions/page.tsx` was.
 *
 * The filter lives here rather than in the view because it is the query key:
 * the ledger is a page from the server, not a local slice, so the thing that
 * decides which page is fetched has to sit above the thing that fetches it.
 */
export const TransactionsPage = () => {
  const { messages } = useLocale();
  const [filter, setFilter] = useState<LedgerFilter>(DEFAULT_LEDGER_FILTER);

  const ledger = useLedger(filter);
  const parties = useParties();

  const failure = ledger.error ?? parties.error;

  if (failure) {
    return (
      <p
        className="m-6 rounded-lg border-2 border-destructive/50 bg-destructive/10 px-4 py-3 font-medium text-destructive"
        role="alert"
      >
        {failure.message}
      </p>
    );
  }

  // Guarding on the data rather than on `isPending` is what lets TypeScript
  // narrow both to their loaded types below.
  if (!(ledger.data && parties.data)) {
    return (
      <output
        aria-label={messages["nav.transactions"]}
        className="flex flex-1 items-center justify-center py-20"
      >
        <Spinner className="size-8" />
      </output>
    );
  }

  return (
    <TransactionsView
      filter={filter}
      messages={messages}
      onFilterChange={setFilter}
      page={ledger.data}
      parties={parties.data}
    />
  );
};
