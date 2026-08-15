import { Spinner } from "@repo/design-system/components/ui/spinner";
import { getRouteApi } from "@tanstack/react-router";
import { useCombos, useProducts } from "@/features/products/api";
import { useLocale } from "@/lib/i18n/provider";
import { useOrders } from "../api";
import { orderSeedFrom, toPosProducts } from "../types";
import { OrdersView } from "./orders-view";

const route = getRouteApi("/_authed/orders/");

/**
 * What `app/(authenticated)/orders/page.tsx` was.
 *
 * The catalog rides along with the list rather than being fetched when the edit
 * sheet opens, so the sheet has nothing to wait for — the same reason the server
 * component fetched all three together.
 */
export const OrdersPage = () => {
  const { locale, messages } = useLocale();
  const seed = orderSeedFrom(route.useSearch());
  const orders = useOrders();
  const products = useProducts();
  const combos = useCombos();

  const failure = orders.error ?? products.error ?? combos.error;

  if (failure) {
    return (
      <p
        className="m-6 rounded-lg border-2 border-destructive/50 bg-destructive/10 px-4 py-3 font-medium text-destructive"
        role="alert"
      >
        {failure.message}
      </p>
    );
  }

  if (!(orders.data && products.data && combos.data)) {
    return (
      <output
        aria-label={messages["nav.orders"]}
        className="flex flex-1 items-center justify-center py-20"
      >
        <Spinner className="size-8" />
      </output>
    );
  }

  return (
    // Keyed by the seed so a change of URL re-applies it — see MembersPage.
    <OrdersView
      key={`${seed.filter}|${seed.q}`}
      locale={locale}
      messages={messages}
      products={toPosProducts(products.data, combos.data)}
      seed={seed}
      summaries={orders.data}
    />
  );
};
