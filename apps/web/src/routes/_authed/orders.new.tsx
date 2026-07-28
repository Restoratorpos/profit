import { createFileRoute } from "@tanstack/react-router";
import { Placeholder } from "@/components/placeholder";

export const Route = createFileRoute("/_authed/orders/new")({
  component: () => <Placeholder titleKey="nav.newOrder" />,
});
