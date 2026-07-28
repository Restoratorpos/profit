import { createFileRoute } from "@tanstack/react-router";
import { Placeholder } from "@/components/placeholder";

export const Route = createFileRoute("/_authed/workers")({
  component: () => <Placeholder titleKey="nav.staff" />,
});
