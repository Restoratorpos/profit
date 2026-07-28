import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  apiDelete,
  apiFetch,
  apiPatch,
  apiPost,
  apiPut,
} from "@/lib/api/client";
import type { CategoryListItem, ComboListItem, ProductListItem } from "./types";

/**
 * The catalog: products, categories and combos.
 *
 * These three are one vertical rather than three because no screen can be
 * served by its own list alone — a combo names its components, and an
 * ingredient's usefulness is measured by the combos using it. The Next version
 * said the same thing by having one `CatalogPage` fetch all three for all three
 * tabs.
 */

export const productKeys = {
  all: ["products"] as const,
  list: () => [...productKeys.all, "list"] as const,
};

export const comboKeys = {
  all: ["combos"] as const,
  list: () => [...comboKeys.all, "list"] as const,
};

export const categoryKeys = {
  all: ["categories"] as const,
  list: () => [...categoryKeys.all, "list"] as const,
};

export const productsQuery = queryOptions({
  queryKey: productKeys.list(),
  queryFn: () => apiFetch<ProductListItem[]>("/products"),
});

export const combosQuery = queryOptions({
  queryKey: comboKeys.list(),
  queryFn: () => apiFetch<ComboListItem[]>("/combos"),
});

export const categoriesQuery = queryOptions({
  queryKey: categoryKeys.list(),
  queryFn: () => apiFetch<CategoryListItem[]>("/categories"),
});

export const useProducts = () => useQuery(productsQuery);
export const useCombos = () => useQuery(combosQuery);
export const useCategories = () => useQuery(categoriesQuery);

/**
 * Everything the catalog shows moves together.
 *
 * Renaming a category retitles product rows; deleting a product changes which
 * combos are still buildable. The Next version invalidated the whole
 * `/products` route for the same reason — there is no useful finer grain here,
 * and getting it wrong shows up as a screen disagreeing with itself.
 */
const useSettleCatalog = () => {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: productKeys.all });
    queryClient.invalidateQueries({ queryKey: comboKeys.all });
    queryClient.invalidateQueries({ queryKey: categoryKeys.all });
  };
};

export interface ProductInput {
  categoryId: string | null;
  color?: string | null;
  cost: string;
  name: string;
  price: string;
  productType: string;
  unit?: string | null;
}

export const useSaveProduct = () => {
  const settle = useSettleCatalog();

  return useMutation({
    mutationFn: ({
      input,
      productId,
    }: {
      input: ProductInput;
      productId?: string;
    }) =>
      productId
        ? apiPatch<void>(`/products/${productId}`, input)
        : apiPost<void>("/products", input),
    onSuccess: settle,
  });
};

export const useDeleteProduct = () => {
  const settle = useSettleCatalog();

  return useMutation({
    mutationFn: (productId: string) => apiDelete(`/products/${productId}`),
    onSuccess: settle,
  });
};

/** Returns the created row so the picker that opened it can select it. */
export const useCreateCategory = () => {
  const settle = useSettleCatalog();

  return useMutation({
    mutationFn: ({
      color = null,
      name,
    }: {
      color?: string | null;
      name: string;
    }) => apiPost<CategoryListItem>("/categories", { color, name }),
    onSuccess: settle,
  });
};

export const useUpdateCategory = () => {
  const settle = useSettleCatalog();

  return useMutation({
    mutationFn: ({ categoryId, name }: { categoryId: string; name: string }) =>
      apiPatch<void>(`/categories/${categoryId}`, { name }),
    onSuccess: settle,
  });
};

export const useDeleteCategory = () => {
  const settle = useSettleCatalog();

  return useMutation({
    mutationFn: (categoryId: string) => apiDelete(`/categories/${categoryId}`),
    onSuccess: settle,
  });
};

export interface ComboInput {
  categoryId: string | null;
  color?: string | null;
  components: { productId: string; quantity: string }[];
  name: string;
  price: string;
  /** Which shelf the combo itself sells from — "bar" or "shop". */
  productType: string;
}

export const useSaveCombo = () => {
  const settle = useSettleCatalog();

  return useMutation({
    mutationFn: ({
      comboId,
      input,
    }: {
      comboId?: string;
      input: ComboInput;
    }) =>
      comboId
        ? // PUT, not PATCH: an edit sends the combo's whole makeup and replaces
          // it, so a component left out of the payload is a component removed.
          apiPut<void>(`/combos/${comboId}`, input)
        : apiPost<void>("/combos", input),
    onSuccess: settle,
  });
};

export const useDeleteCombo = () => {
  const settle = useSettleCatalog();

  return useMutation({
    mutationFn: (comboId: string) => apiDelete(`/combos/${comboId}`),
    onSuccess: settle,
  });
};
