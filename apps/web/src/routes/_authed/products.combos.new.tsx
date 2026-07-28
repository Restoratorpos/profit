import { createFileRoute } from "@tanstack/react-router";
import { catalogLoader, NewComboPage } from "@/features/products";

export const Route = createFileRoute("/_authed/products/combos/new")({
  loader: catalogLoader,
  component: NewComboPage,
});
