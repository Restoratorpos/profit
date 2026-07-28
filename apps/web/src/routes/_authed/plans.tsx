import { createFileRoute } from "@tanstack/react-router";
import {
  hallsQuery,
  PlansPage,
  plansQuery,
  trainersQuery,
} from "@/features/plans";

export const Route = createFileRoute("/_authed/plans")({
  /*
   * Starts the fetches during navigation instead of on mount.
   *
   * This recovers most of what the Next server component gave us: by the time
   * the component renders the data is usually already there, so the table
   * arrives populated rather than after a spinner. `ensureQueryData` is not
   * awaited — the route still renders immediately and the queries resolve
   * underneath it, which is the point.
   */
  loader: ({ context: { queryClient } }) => {
    queryClient.ensureQueryData(plansQuery);
    queryClient.ensureQueryData(hallsQuery);
    queryClient.ensureQueryData(trainersQuery);
  },
  component: PlansPage,
});
