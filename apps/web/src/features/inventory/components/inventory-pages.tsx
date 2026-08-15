import { Spinner } from "@repo/design-system/components/ui/spinner";
import { getRouteApi } from "@tanstack/react-router";
import { useProducts } from "@/features/products";
import { useLocale } from "@/lib/i18n/provider";
import { useMovements, useStock, useSuppliers } from "../api";
import { stockSeedFrom } from "../types";
import { HistoryView } from "./history-view";
import { InventoryView } from "./inventory-view";
import { SuppliersView } from "./suppliers-view";

const stockRoute = getRouteApi("/_authed/inventory/");

/**
 * The three inventory screens: stock, its movement history, and the suppliers
 * the stock is owed to.
 *
 * They are one feature rather than three because they are three views of the
 * same documents — a delivery is a row on the stock table, a line in the
 * history, and a debt on the supplier. Writing one invalidates all three (see
 * api.ts), which only works if they live together.
 */

const Failure = ({ message }: { message: string }) => (
  <p
    className="m-6 rounded-lg border-2 border-destructive/50 bg-destructive/10 px-4 py-3 font-medium text-destructive"
    role="alert"
  >
    {message}
  </p>
);

const Loading = ({ label }: { label: string }) => (
  <output
    aria-label={label}
    className="flex flex-1 items-center justify-center py-20"
  >
    <Spinner className="size-8" />
  </output>
);

export const InventoryPage = () => {
  const { messages } = useLocale();
  const seed = stockSeedFrom(stockRoute.useSearch());
  const stock = useStock();
  const suppliers = useSuppliers();
  const products = useProducts();

  const failure = stock.error ?? suppliers.error ?? products.error;

  if (failure) {
    return <Failure message={failure.message} />;
  }

  if (!(stock.data && suppliers.data && products.data)) {
    return <Loading label={messages["nav.inventory"]} />;
  }

  return (
    // Keyed by the seed so a change of URL re-applies it — see MembersPage.
    <InventoryView
      key={`${seed.q}|${seed.sort}|${seed.status}`}
      messages={messages}
      products={products.data}
      seed={seed}
      stock={stock.data}
      suppliers={suppliers.data}
    />
  );
};

export const HistoryPage = () => {
  const { messages } = useLocale();
  const movements = useMovements();

  if (movements.error) {
    return <Failure message={movements.error.message} />;
  }

  if (!movements.data) {
    return <Loading label={messages["inventory.history"]} />;
  }

  return <HistoryView messages={messages} movements={movements.data} />;
};

export const SuppliersPage = () => {
  const { messages } = useLocale();
  const suppliers = useSuppliers();

  if (suppliers.error) {
    return <Failure message={suppliers.error.message} />;
  }

  if (!suppliers.data) {
    return <Loading label={messages["suppliers.title"]} />;
  }

  return <SuppliersView messages={messages} suppliers={suppliers.data} />;
};
