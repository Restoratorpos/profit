import { createRouter } from "@tanstack/react-router";
import { queryClient } from "@/lib/query-client";
import { routeTree } from "./routeTree.gen";

/**
 * `auth` is filled in by the RouterProvider at render time — it lives in React
 * state and changes when someone signs in or out, which is not knowable here.
 * The non-null assertion is the shape TanStack's own docs use for exactly this:
 * declare the contract now, satisfy it at the provider.
 */
export const router = createRouter({
  routeTree,
  context: { auth: undefined as never, queryClient },
  // Data is fetched through react-query, which does its own staleness
  // accounting; letting the router preload on intent just warms those queries.
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
