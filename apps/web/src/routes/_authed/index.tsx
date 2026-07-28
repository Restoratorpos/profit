import { createFileRoute } from "@tanstack/react-router";

/**
 * Intentionally empty, matching apps/app.
 *
 * Not a placeholder awaiting a port — there is nothing to port. The dashboard
 * has always rendered nothing, deliberately: anything hardcoded here would be
 * untranslated and would contradict the language switcher. It was showing
 * "Not ported yet", which was simply untrue.
 */
export const Route = createFileRoute("/_authed/")({
  component: () => <div className="flex-1" />,
});
