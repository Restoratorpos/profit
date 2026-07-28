import { createFileRoute } from "@tanstack/react-router";
import { InventoryPage, stockQuery, suppliersQuery } from "@/features/inventory";
import { productsQuery } from "@/features/products";

export const Route = createFileRoute("/_authed/inventory/")({
  loader: ({ context: { queryClient } }) => {
    queryClient.ensureQueryData(stockQuery);
    // The delivery sheet needs both: a supplier to attribute the document to,
    // and the catalog to pick lines from.
    queryClient.ensureQueryData(suppliersQuery);
    queryClient.ensureQueryData(productsQuery);
  },
  component: InventoryPage,
});
