import { createFileRoute } from "@tanstack/react-router";
import { CatalogPage, catalogLoader } from "@/features/products";

export const Route = createFileRoute("/_authed/products/ingredients")({
  loader: catalogLoader,
  component: () => <CatalogPage tab="ingredients" />,
});
