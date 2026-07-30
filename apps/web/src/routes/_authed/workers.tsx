import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { WorkersPage, workersPageQuery } from "@/features/workers";
import {
  DEFAULT_WORKER_QUERY,
  RANGE_PRESETS,
  rangeForPreset,
} from "@/features/workers/types";

/**
 * The date range is URL state, so it survives a reload and can be shared.
 *
 * Validated here rather than coerced in the page: an unknown `range=` is a bad
 * request, and catching it at the boundary means everything downstream can
 * treat the preset as one the page knows about.
 *
 * The page opens on the whole of the books rather than the current month. Every
 * figure on the table is computed over the range, so a month-long default
 * showed each worker's balance for *this month* — which reads as the balance,
 * and is not it. "Butun davr" is the question the desk is actually asking.
 */
const searchSchema = z.object({
  range: z.enum(RANGE_PRESETS).catch("all-time"),
  /** Only meaningful when `range` is "custom"; ignored otherwise. */
  from: z.string().optional(),
  to: z.string().optional(),
});

export const Route = createFileRoute("/_authed/workers")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context: { queryClient }, deps }) => {
    const bounds =
      deps.range === "custom"
        ? { from: deps.from ?? "", to: deps.to ?? "" }
        : rangeForPreset(deps.range);

    queryClient.ensureQueryData(workersPageQuery(DEFAULT_WORKER_QUERY, bounds));
  },
  component: WorkersPage,
});
