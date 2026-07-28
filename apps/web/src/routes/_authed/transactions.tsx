import { createFileRoute } from "@tanstack/react-router";
import { Placeholder } from "@/components/placeholder";

export const Route = createFileRoute("/_authed/transactions")({
  component: () => <Placeholder titleKey="nav.transactions" />,
});
