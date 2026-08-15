import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  InventoryPage,
  stockQuery,
  suppliersQuery,
} from "@/features/inventory";
import { STOCK_FILTERS, STOCK_SORTS } from "@/features/inventory/types";
import { productsQuery } from "@/features/products";
import { searchText } from "@/lib/search-text";

/**
 * The stock screen opens on whatever the URL asks for, so the dashboard's
 * low-stock card can point at what it is about: `sort=stock` puts the empty
 * shelves at the top, and one of its rows links here with the product's name
 * in `q`.
 *
 * Sorted rather than filtered on purpose — that card lists "low" and "out"
 * together, and this screen's status filter can only be one of them, so a link
 * that picked one would hide half the rows the card had just shown.
 *
 * Filtering here is client-side over a list this screen already holds, so a
 * deep link warms nothing extra. See the members route for why the URL only
 * seeds these controls rather than owning them.
 */
const searchSchema = z.object({
  q: searchText,
  sort: z.enum(STOCK_SORTS).optional().catch(undefined),
  status: z.enum(STOCK_FILTERS).optional().catch(undefined),
});

export const Route = createFileRoute("/_authed/inventory/")({
  validateSearch: searchSchema,
  loader: ({ context: { queryClient } }) => {
    queryClient.ensureQueryData(stockQuery);
    // The delivery sheet needs both: a supplier to attribute the document to,
    // and the catalog to pick lines from.
    queryClient.ensureQueryData(suppliersQuery);
    queryClient.ensureQueryData(productsQuery);
  },
  component: InventoryPage,
});
