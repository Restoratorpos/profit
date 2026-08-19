import { Spinner } from "@repo/design-system/components/ui/spinner";
import { getRouteApi } from "@tanstack/react-router";
import { useState } from "react";
import { useLocale } from "@/lib/i18n/provider";
import { useLedger, useParties } from "../api";
import { isSeeded, type LedgerFilter, ledgerFilterFrom } from "../types";
import { TransactionsView } from "./transactions-view";

const route = getRouteApi("/_authed/transactions");

/**
 * What `app/(authenticated)/transactions/page.tsx` was.
 *
 * The filter lives here rather than in the view because it is the query key:
 * the ledger is a page from the server, not a local slice, so the thing that
 * decides which page is fetched has to sit above the thing that fetches it.
 */
const Ledger = ({ seed }: { seed: LedgerFilter }) => {
  const { messages } = useLocale();
  const [filter, setFilter] = useState<LedgerFilter>(seed);

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
      showBack={isSeeded(seed)}
    />
  );
};

export const TransactionsPage = () => {
  const seed = ledgerFilterFrom(route.useSearch());

  /*
   * Keyed by the seed, and split from the component above for the same reason
   * `/members` is: the filter is `useState`, and `useState` ignores a changed
   * initial value. Navigating within one route does not remount, so without
   * this the dashboard's "chiqim" link would leave the address bar saying
   * `kind=expense` while the list still showed whatever was on screen — or
   * keep a filter after the sidebar's plain "Tranzaksiyalar" link had cleared
   * it. Remounting also closes an open entry sheet, which is the right answer
   * for a deliberate navigation.
   */
  return <Ledger key={`${seed.kind}:${seed.cashbox}`} seed={seed} />;
};
