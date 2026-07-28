import { Spinner } from "@repo/design-system/components/ui/spinner";
import type { QueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useLocale } from "@/lib/i18n/provider";
import {
  categoriesQuery,
  combosQuery,
  productsQuery,
  useCategories,
  useCombos,
  useProducts,
} from "../api";
import { ComboComposer } from "./combo-composer";
import { type CatalogTab, ProductsView } from "./products-view";

/**
 * All three catalog tabs read the same three endpoints — a combo names its
 * components and an ingredient is counted by the combos using it, so no tab can
 * be served by its own list alone. One loader for all of them, as the Next
 * version had, rather than five routes fetching overlapping sets and drifting.
 */
export const catalogLoader = ({
  context: { queryClient },
}: {
  context: { queryClient: QueryClient };
}) => {
  queryClient.ensureQueryData(productsQuery);
  queryClient.ensureQueryData(categoriesQuery);
  queryClient.ensureQueryData(combosQuery);
};

/** The three queries plus the loading and error states they share. */
const useCatalog = () => {
  const products = useProducts();
  const categories = useCategories();
  const combos = useCombos();

  return {
    categories: categories.data,
    combos: combos.data,
    error: products.error ?? categories.error ?? combos.error,
    products: products.data,
  };
};

const CatalogFailure = ({ message }: { message: string }) => (
  <p
    className="m-6 rounded-lg border-2 border-destructive/50 bg-destructive/10 px-4 py-3 font-medium text-destructive"
    role="alert"
  >
    {message}
  </p>
);

const CatalogLoading = ({ label }: { label: string }) => (
  <output
    aria-label={label}
    className="flex flex-1 items-center justify-center py-20"
  >
    <Spinner className="size-8" />
  </output>
);

export const CatalogPage = ({ tab }: { tab: CatalogTab }) => {
  const { messages } = useLocale();
  const { categories, combos, error, products } = useCatalog();

  if (error) {
    return <CatalogFailure message={error.message} />;
  }

  if (!(products && categories && combos)) {
    return <CatalogLoading label={messages["products.title"]} />;
  }

  return (
    <ProductsView
      categories={categories}
      combos={combos}
      messages={messages}
      products={products}
      tab={tab}
    />
  );
};

export const NewComboPage = () => {
  const { messages } = useLocale();
  const { categories, error, products } = useCatalog();

  if (error) {
    return <CatalogFailure message={error.message} />;
  }

  if (!(products && categories)) {
    return <CatalogLoading label={messages["combos.new"]} />;
  }

  return (
    <ComboComposer
      categories={categories}
      messages={messages}
      products={products}
    />
  );
};

export const EditComboPage = () => {
  const { comboId } = useParams({ from: "/_authed/products/combos/$comboId" });
  const { messages } = useLocale();
  const { categories, combos, error, products } = useCatalog();

  if (error) {
    return <CatalogFailure message={error.message} />;
  }

  if (!(products && categories && combos)) {
    return <CatalogLoading label={messages["combos.edit"]} />;
  }

  const combo = combos.find((row) => row.id === comboId);

  /*
   * The Next version called notFound() here. There is no equivalent to throw at
   * a router that has already matched its route, and the honest answer is the
   * same either way: the combo list loaded and this id is not in it.
   */
  if (!combo) {
    return <CatalogFailure message={messages["combos.noResults"]} />;
  }

  return (
    <ComboComposer
      categories={categories}
      combo={combo}
      messages={messages}
      products={products}
    />
  );
};
