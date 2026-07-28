import { queryOptions, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import type { ComboListItem, ProductListItem } from "./types";

/**
 * The catalog's read side.
 *
 * Landed ahead of the rest of the products vertical because orders needs it:
 * both the POS composer and the edit sheet's "add product" picker are built
 * from products + combos, and defining those queries twice is how two screens
 * start disagreeing about what is for sale.
 */

export const productKeys = {
  all: ["products"] as const,
  list: () => [...productKeys.all, "list"] as const,
};

export const comboKeys = {
  all: ["combos"] as const,
  list: () => [...comboKeys.all, "list"] as const,
};

export const productsQuery = queryOptions({
  queryKey: productKeys.list(),
  queryFn: () => apiFetch<ProductListItem[]>("/products"),
});

export const combosQuery = queryOptions({
  queryKey: comboKeys.list(),
  queryFn: () => apiFetch<ComboListItem[]>("/combos"),
});

export const useProducts = () => useQuery(productsQuery);
export const useCombos = () => useQuery(combosQuery);
