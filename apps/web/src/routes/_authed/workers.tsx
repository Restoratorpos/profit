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
 * The page opens on **this month**, because wages are settled by the month:
 * `/workers` is opened to answer "what do I owe this person now", and the pay
 * window it leads to books a payment against a month. Opening on the whole of
 * the books answered a different question — every hour since January, against
 * every som ever handed over — and left the operator changing the range before
 * the screen was useful.
 *
 * What that costs, and it is worth knowing: every figure on the table is
 * computed over the range, so "Qoldiq" is now this month's balance rather than
 * the lifetime one. The range control says which month, and "Barcha" is one
 * press away for the lifetime figure.
 */
const searchSchema = z.object({
  range: z.enum(RANGE_PRESETS).catch("this-month"),
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
