import { createFileRoute } from "@tanstack/react-router";
import { CatalogPage, catalogLoader } from "@/features/products";

export const Route = createFileRoute("/_authed/products/")({
  loader: catalogLoader,
  component: () => <CatalogPage tab="products" />,
});
