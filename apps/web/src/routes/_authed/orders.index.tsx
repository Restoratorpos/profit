import { createFileRoute } from "@tanstack/react-router";
import { OrdersPage, ordersQuery } from "@/features/orders";
import { combosQuery, productsQuery } from "@/features/products";

export const Route = createFileRoute("/_authed/orders/")({
  loader: ({ context: { queryClient } }) => {
    queryClient.ensureQueryData(ordersQuery);
    // The edit sheet's product picker needs these, and warming them here means
    // opening the sheet has nothing to wait for.
    queryClient.ensureQueryData(productsQuery);
    queryClient.ensureQueryData(combosQuery);
  },
  component: OrdersPage,
});
