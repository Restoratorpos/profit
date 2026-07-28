import { createFileRoute } from "@tanstack/react-router";
import { Placeholder } from "@/components/placeholder";

export const Route = createFileRoute("/_authed/products")({
  component: () => <Placeholder titleKey="nav.products" />,
});
