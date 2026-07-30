import { createFileRoute } from "@tanstack/react-router";
import {
  DashboardPage,
  DEFAULT_REVENUE_RANGE,
  revenueQuery,
  snapshotQuery,
} from "@/features/dashboard";

/**
 * The home screen. It was deliberately empty until now — anything hardcoded here
 * would have been untranslated and would have contradicted the language
 * switcher — and it is the first screen every session lands on.
 *
 * Both queries are warmed here rather than on mount, and the default window is
 * the one warmed: the page opens on it, and a range the operator has not pressed
 * yet is not worth a request. Neither is awaited, so the shell still paints
 * immediately and the page shows its own spinner.
 */
export const Route = createFileRoute("/_authed/")({
  loader: ({ context: { queryClient } }) => {
    queryClient.ensureQueryData(snapshotQuery);
    queryClient.ensureQueryData(revenueQuery(DEFAULT_REVENUE_RANGE));
  },
  component: DashboardPage,
});
