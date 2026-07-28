import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";

/**
 * The signed-in half of the app — the direct equivalent of Next's
 * `app/(authenticated)/` group, and of the `authorized` callback in
 * packages/auth/config.ts that enforced it.
 *
 * The guard runs in `beforeLoad`, so an unauthenticated visit never mounts the
 * shell or fires a query; it redirects before any of that. `redirect` carries
 * where they were going, so signing in lands them there rather than dumping
 * them on the dashboard.
 */
export const Route = createFileRoute("/_authed")({
  beforeLoad: ({ context, location }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({
        to: "/sign-in",
        search: { redirect: location.href },
      });
    }
  },
  component: AppLayout,
});
