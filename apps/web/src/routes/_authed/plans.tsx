import { createFileRoute } from "@tanstack/react-router";
import { Placeholder } from "@/components/placeholder";

export const Route = createFileRoute("/_authed/plans")({
  component: () => <Placeholder titleKey="nav.plans" />,
});
