import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { OrdersPage, ordersQuery } from "@/features/orders";
import { ORDER_FILTERS } from "@/features/orders/types";
import { combosQuery, productsQuery } from "@/features/products";
import { searchText } from "@/lib/search-text";

/**
 * The tab and the search term come from the URL, so the dashboard's "qarzdorlar"
 * card can link to the unpaid list and one of its rows to the person on it.
 *
 * `filter` defaults to `unpaid` — the same tab this screen has always opened on,
 * now written down rather than assumed, so the link the dashboard sends and the
 * screen's own default cannot drift apart. See the members route for why the URL
 * only seeds these controls rather than owning them.
 */
const searchSchema = z.object({
  filter: z.enum(ORDER_FILTERS).optional().catch(undefined),
  q: searchText,
});

export const Route = createFileRoute("/_authed/orders/")({
  validateSearch: searchSchema,
  loader: ({ context: { queryClient } }) => {
    queryClient.ensureQueryData(ordersQuery);
    // The edit sheet's product picker needs these, and warming them here means
    // opening the sheet has nothing to wait for.
    queryClient.ensureQueryData(productsQuery);
    queryClient.ensureQueryData(combosQuery);
  },
  component: OrdersPage,
});
