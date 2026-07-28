import { createFileRoute } from "@tanstack/react-router";
import { catalogLoader, EditComboPage } from "@/features/products";

export const Route = createFileRoute("/_authed/products/combos/$comboId")({
  loader: catalogLoader,
  component: EditComboPage,
});
