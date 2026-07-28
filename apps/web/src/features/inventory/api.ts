import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiDelete, apiFetch, apiPatch, apiPost } from "@/lib/api/client";
import type {
  InventoryItem,
  MovementView,
  PaymentMethod,
  SupplierSummary,
} from "./types";

export const inventoryKeys = {
  all: ["inventory"] as const,
  stock: () => [...inventoryKeys.all, "stock"] as const,
  movements: () => [...inventoryKeys.all, "movements"] as const,
  productMovements: (productId: string) =>
    [...inventoryKeys.all, "movements", productId] as const,
};

export const supplierKeys = {
  all: ["suppliers"] as const,
  list: () => [...supplierKeys.all, "list"] as const,
};

/** How many movement rows the history screen asks for. A window, not a paginator. */
const HISTORY_LIMIT = 200;
/** The drawer shows one product's recent movements, so it needs fewer. */
const PRODUCT_HISTORY_LIMIT = 100;

export const stockQuery = queryOptions({
  queryKey: inventoryKeys.stock(),
  queryFn: () => apiFetch<InventoryItem[]>("/inventory"),
});

export const suppliersQuery = queryOptions({
  queryKey: supplierKeys.list(),
  queryFn: () => apiFetch<SupplierSummary[]>("/suppliers"),
});

export const movementsQuery = queryOptions({
  queryKey: inventoryKeys.movements(),
  queryFn: () =>
    apiFetch<MovementView[]>(`/inventory/movements?limit=${HISTORY_LIMIT}`),
});

export const useStock = () => useQuery(stockQuery);
export const useSuppliers = () => useQuery(suppliersQuery);
export const useMovements = () => useQuery(movementsQuery);

/**
 * One product's movements, for the drawer.
 *
 * Fetched on open rather than with the page: the drawer opens on a row the
 * table already rendered, and shipping every product's history up front to
 * serve the one row that gets opened would be most of the payload wasted.
 */
export const useProductMovements = (productId: string | null) =>
  useQuery({
    queryKey: inventoryKeys.productMovements(productId ?? ""),
    queryFn: () =>
      apiFetch<MovementView[]>(
        `/inventory/movements?productId=${encodeURIComponent(productId ?? "")}&limit=${PRODUCT_HISTORY_LIMIT}`
      ),
    enabled: productId !== null,
  });

/**
 * A stock document changes both what is on the shelf and what is owed.
 *
 * So every write here settles three things at once — the stock table, the
 * movement history and the suppliers screen. That is what the Next version's
 * three `revalidatePath` calls said, and the money side matters as much as the
 * quantities: a delivery paid short is a debt the suppliers screen reports.
 */
const useSettleInventory = () => {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
    queryClient.invalidateQueries({ queryKey: supplierKeys.all });
    // Stock levels are derived from the same documents the catalog lists.
    queryClient.invalidateQueries({ queryKey: ["products"] });
  };
};

export interface StockActionInput {
  actionType: "in" | "return" | "writeoff";
  items: { productId: string; quantity: string; unitCost?: string }[];
  note?: string | null;
  paidAmount?: string;
  paymentMethod?: PaymentMethod;
  supplierId?: string | null;
}

export const useCreateStockAction = () => {
  const settle = useSettleInventory();

  return useMutation({
    mutationFn: (input: StockActionInput) =>
      apiPost<void>("/inventory/actions", input),
    onSuccess: settle,
  });
};

export interface StocktakeInput {
  items: { counted: string; productId: string }[];
  note?: string | null;
}

export const useCreateStocktake = () => {
  const settle = useSettleInventory();

  return useMutation({
    mutationFn: (input: StocktakeInput) =>
      apiPost<void>("/inventory/stocktakes", input),
    onSuccess: settle,
  });
};

export const useVoidStockAction = () => {
  const settle = useSettleInventory();

  return useMutation({
    mutationFn: (actionId: string) =>
      apiDelete(`/inventory/actions/${actionId}`),
    onSuccess: settle,
  });
};

export interface SupplierInput {
  passport?: string | null;
  phone?: string | null;
  supplier: string;
  supplierType?: string | null;
}

/**
 * Hands the created row back: the delivery sheet creates a supplier and then
 * immediately selects it, and re-reading the list to find it by name would race
 * with the invalidation.
 */
export const useCreateSupplier = () => {
  const settle = useSettleInventory();

  return useMutation({
    mutationFn: (input: SupplierInput) =>
      apiPost<SupplierSummary>("/suppliers", input),
    onSuccess: settle,
  });
};

export const useUpdateSupplier = () => {
  const settle = useSettleInventory();

  return useMutation({
    mutationFn: ({
      input,
      supplierId,
    }: {
      input: Partial<SupplierInput>;
      supplierId: string;
    }) => apiPatch<void>(`/suppliers/${supplierId}`, input),
    onSuccess: settle,
  });
};

export const useDeleteSupplier = () => {
  const settle = useSettleInventory();

  return useMutation({
    mutationFn: (supplierId: string) => apiDelete(`/suppliers/${supplierId}`),
    onSuccess: settle,
  });
};

export const usePaySupplier = () => {
  const settle = useSettleInventory();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      input,
      supplierId,
    }: {
      input: { amount: string; method: PaymentMethod; note?: string | null };
      supplierId: string;
    }) => apiPost<void>(`/suppliers/${supplierId}/pay`, input),
    onSuccess: () => {
      settle();
      // Money left the till, so the cashbox balances moved with it.
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
};
