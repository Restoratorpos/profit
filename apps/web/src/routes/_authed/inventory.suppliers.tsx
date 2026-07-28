import { createFileRoute } from "@tanstack/react-router";
import { SuppliersPage, suppliersQuery } from "@/features/inventory";

export const Route = createFileRoute("/_authed/inventory/suppliers")({
  loader: ({ context: { queryClient } }) => {
    queryClient.ensureQueryData(suppliersQuery);
  },
  component: SuppliersPage,
});
