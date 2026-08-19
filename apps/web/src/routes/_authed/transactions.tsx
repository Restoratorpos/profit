import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ledgerQuery, partiesQuery, TransactionsPage } from "@/features/transactions";
import {
  CASHBOXES,
  LEDGER_KIND_VALUES,
  ledgerFilterFrom,
} from "@/features/transactions/types";

/**
 * The ledger opens on whatever the URL asks for, so another screen can point at
 * a slice of it — the dashboard's takings tile links here with `kind=income`
 * and its spending tile with `kind=expense`, which is the difference between
 * "here is a number" and "here is where that number came from".
 *
 * Same contract as `/members`: every field optional and every field `.catch`ed,
 * so a bare `/transactions` is still the whole ledger and a hand-edited
 * `kind=nonsense` opens it too rather than erroring. The URL seeds the screen
 * and does not own it — the tills and the kind toggle stay component state
 * afterwards, so the link is reproducible when opened and stale the moment it
 * is used.
 */
const searchSchema = z.object({
  cashbox: z.enum(CASHBOXES).optional().catch(undefined),
  kind: z.enum(LEDGER_KIND_VALUES).optional().catch(undefined),
});

export const Route = createFileRoute("/_authed/transactions")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => search,
  /*
   * Both are warmed now. The ledger's key used to be component state with
   * nothing stable to prefetch, but the URL's opening filter is stable — and
   * warming the default only to mount a filtered view is two round trips for
   * one screen.
   */
  loader: ({ context: { queryClient }, deps }) => {
    queryClient.ensureQueryData(ledgerQuery(ledgerFilterFrom(deps)));
    queryClient.ensureQueryData(partiesQuery);
  },
  component: TransactionsPage,
});
