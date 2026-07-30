import { Spinner } from "@repo/design-system/components/ui/spinner";
import { useState } from "react";
import { useLocale } from "@/lib/i18n/provider";
import { useRevenue, useSnapshot } from "../api";
import { DEFAULT_REVENUE_RANGE, type RevenueRange } from "../types";
import { DashboardView } from "./dashboard-view";

/**
 * What `app/(authenticated)/page.tsx` never was — the dashboard was empty in the
 * Next app and stayed empty through the migration.
 *
 * The range lives here rather than in the view because it is the revenue query's
 * key: what decides which window is fetched has to sit above what fetches it.
 * The snapshot has no range at all, which is why they are two queries — moving
 * the chart from a week to a month must not re-read the roster and the shelves.
 */
export const DashboardPage = () => {
  const { messages } = useLocale();
  const [range, setRange] = useState<RevenueRange>(DEFAULT_REVENUE_RANGE);

  const snapshot = useSnapshot();
  const revenue = useRevenue(range);

  const failure = snapshot.error ?? revenue.error;

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

  /*
   * Gating on the data rather than on `isPending` is what narrows both to their
   * loaded types below. Both are waited for, unlike other screens that release
   * the page as soon as its spine arrives: every tile here is the point of the
   * screen, so a half-drawn dashboard is a screen that reflows under the cursor.
   * Switching the range afterwards never returns here — the query holds the
   * previous window's data while the next one loads.
   */
  if (!(snapshot.data && revenue.data)) {
    return (
      <output
        aria-label={messages["nav.dashboard"]}
        className="flex flex-1 items-center justify-center py-20"
      >
        <Spinner className="size-8" />
      </output>
    );
  }

  return (
    <DashboardView
      isRevenueStale={revenue.isFetching}
      messages={messages}
      onRangeChange={setRange}
      range={range}
      report={revenue.data}
      snapshot={snapshot.data}
    />
  );
};
