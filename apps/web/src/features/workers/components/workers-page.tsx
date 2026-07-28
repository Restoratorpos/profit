import { Spinner } from "@repo/design-system/components/ui/spinner";
import { getRouteApi } from "@tanstack/react-router";
import { useLocale } from "@/lib/i18n/provider";
import { useWorkersPage } from "../api";
import { DEFAULT_WORKER_QUERY, rangeForPreset } from "../types";
import { WorkersView } from "./workers-view";

const route = getRouteApi("/_authed/workers");

/**
 * What `app/(authenticated)/workers/page.tsx` was.
 *
 * The date range lives in the URL, as it did in Next — "show me last month's
 * hours" should survive a reload and be shareable. The difference is that the
 * search params are now validated by the route, so an unknown `range=` is
 * rejected at the boundary rather than silently falling back somewhere deep in
 * a render.
 */
export const WorkersPage = () => {
  const { locale, messages } = useLocale();
  const { from, range, to } = route.useSearch();

  // A preset supplies its own bounds; custom takes them from the URL.
  const bounds =
    range === "custom"
      ? { from: from ?? "", to: to ?? "" }
      : rangeForPreset(range);

  const workers = useWorkersPage(DEFAULT_WORKER_QUERY, bounds);

  if (workers.error) {
    return (
      <p
        className="m-6 rounded-lg border-2 border-destructive/50 bg-destructive/10 px-4 py-3 font-medium text-destructive"
        role="alert"
      >
        {workers.error.message}
      </p>
    );
  }

  if (!workers.data) {
    return (
      <output
        aria-label={messages["workers.title"]}
        className="flex flex-1 items-center justify-center py-20"
      >
        <Spinner className="size-8" />
      </output>
    );
  }

  return (
    <WorkersView
      from={bounds.from}
      initial={workers.data}
      locale={locale}
      messages={messages}
      preset={range}
      to={bounds.to}
    />
  );
};
