import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import type { AuthState } from "@/lib/auth/context";

/**
 * Everything the route tree is allowed to depend on.
 *
 * `auth` is here rather than read from a hook because guards run in
 * `beforeLoad`, outside React's render — a route has to be able to answer "is
 * this person signed in?" before it mounts anything.
 */
export interface RouterContext {
  auth: AuthState;
  queryClient: QueryClient;
}

/*
 * Devtools are dev-only and lazily imported, so neither package reaches the
 * production bundle. import.meta.env.DEV is statically replaced, which lets
 * Rollup drop the whole branch.
 */
const Devtools = import.meta.env.DEV
  ? lazy(async () => {
      const [{ TanStackRouterDevtools }, { ReactQueryDevtools }] =
        await Promise.all([
          import("@tanstack/react-router-devtools"),
          import("@tanstack/react-query-devtools"),
        ]);

      return {
        default: () => (
          <>
            <TanStackRouterDevtools position="bottom-right" />
            <ReactQueryDevtools buttonPosition="bottom-left" />
          </>
        ),
      };
    })
  : null;

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <>
      <Outlet />
      {Devtools ? (
        <Suspense fallback={null}>
          <Devtools />
        </Suspense>
      ) : null}
    </>
  ),
});
