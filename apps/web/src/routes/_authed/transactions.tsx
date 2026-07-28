import { createFileRoute } from "@tanstack/react-router";
import { partiesQuery, TransactionsPage } from "@/features/transactions";

export const Route = createFileRoute("/_authed/transactions")({
  /*
   * Only the parties list is prefetched. The ledger's query key includes the
   * filter, which is component state, so there is nothing stable to warm here —
   * it is fetched on mount instead.
   */
  loader: ({ context: { queryClient } }) => {
    queryClient.ensureQueryData(partiesQuery);
  },
  component: TransactionsPage,
});
