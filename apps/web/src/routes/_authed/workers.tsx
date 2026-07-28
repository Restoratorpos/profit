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
 * treat the preset as one of the four it knows about.
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
