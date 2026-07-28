import { createFileRoute } from "@tanstack/react-router";
import { membersPageQuery } from "@/features/members";
import { DEFAULT_MEMBER_QUERY } from "@/features/members/types";
import { NewOrderPage } from "@/features/orders";
import { combosQuery, productsQuery } from "@/features/products/api";

export const Route = createFileRoute("/_authed/orders/new")({
  loader: ({ context: { queryClient } }) => {
    // The POS grid is the screen; the customer picker is secondary, so all three
    // start together rather than the grid waiting on the roster.
    queryClient.ensureQueryData(productsQuery);
    queryClient.ensureQueryData(combosQuery);
    queryClient.ensureQueryData(membersPageQuery(DEFAULT_MEMBER_QUERY));
  },
  component: NewOrderPage,
});
