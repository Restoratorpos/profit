import type { Metadata } from "next";
import { backendFetch } from "@/lib/backend";
import { getMessages } from "@/lib/i18n/dictionary";
import { getLocale } from "@/lib/i18n/server";
import {
  DEFAULT_WORKER_QUERY,
  RANGE_PRESETS,
  type RangePreset,
  rangeForPreset,
  type WorkerPage,
} from "@/lib/workers";
import { WorkersView } from "./components/workers-view";

export const metadata: Metadata = {
  title: "Workers",
};

const WORKERS_PAGE_PATH = "/workers/page?";

const asPreset = (value: string | undefined): RangePreset =>
  RANGE_PRESETS.find((preset) => preset === value) ?? "this-month";

const WorkersPage = async ({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; range?: string; to?: string }>;
}) => {
  const params = await searchParams;
  const preset = asPreset(params.range);

  // A preset supplies its own bounds; custom takes them from the URL.
  const bounds =
    preset === "custom"
      ? { from: params.from ?? "", to: params.to ?? "" }
      : rangeForPreset(preset);

  const query = new URLSearchParams();

  if (bounds.from) {
    query.set("from", bounds.from);
  }

  if (bounds.to) {
    query.set("to", bounds.to);
  }

  query.set("page", "1");
  query.set("pageSize", String(DEFAULT_WORKER_QUERY.pageSize));
  query.set("status", DEFAULT_WORKER_QUERY.status);

  /*
   * The first page is fetched here rather than by the view on mount, so the
   * table arrives with the document instead of flashing empty. Every change
   * to the search or the filter after that goes through loadWorkersAction.
   */
  const workersPromise = backendFetch<WorkerPage>(
    WORKERS_PAGE_PATH + query.toString()
  );
  const localePromise = getLocale();

  const [initial, locale] = await Promise.all([workersPromise, localePromise]);

  return (
    <WorkersView
      from={bounds.from}
      initial={initial}
      locale={locale}
      messages={getMessages(locale)}
      preset={preset}
      to={bounds.to}
    />
  );
};

export default WorkersPage;
