"use server";

import { revalidatePath } from "next/cache";
import { BackendError, backendFetch } from "@/lib/backend";
import type {
  ActionResult,
  CategoryListItem,
  CreateCategoryResult,
} from "@/lib/catalog";

/**
 * Every export here must be declared `async` — Next rejects a "use server"
 * module that exports a function merely *returning* a promise, because the
 * boundary is checked syntactically, not by return type.
 *
 * `run` turns a thrown BackendError into something the form can render.
 * Anything else is a real fault and is left to reach the error boundary rather
 * than being flattened into a message that says nothing.
 */
const run = async (work: () => Promise<unknown>): Promise<ActionResult> => {
  try {
    await work();
    revalidatePath("/products");

    return { ok: true };
  } catch (error) {
    if (error instanceof BackendError) {
      return { ok: false, error: error.message };
    }

    throw error;
  }
};

export const createProductAction = async (input: {
  name: string;
  productType: string;
  categoryId: string | null;
  price: string;
  cost: string;
  unit: string | null;
  color: string | null;
}): Promise<ActionResult> =>
  run(() => backendFetch("/products", { method: "POST", body: input }));

export const updateProductAction = async (
  productId: string,
  input: Record<string, unknown>
): Promise<ActionResult> =>
  run(() =>
    backendFetch(`/products/${productId}`, { method: "PATCH", body: input })
  );

export const deleteProductAction = async (
  productId: string
): Promise<ActionResult> =>
  run(() => backendFetch(`/products/${productId}`, { method: "DELETE" }));

/**
 * Returns the created row, not just ok/error: the category picker creates and
 * then immediately selects it, and re-fetching the list to find it by name
 * would race with revalidation.
 */
export const createCategoryAction = async (
  name: string,
  color: string | null = null
): Promise<CreateCategoryResult> => {
  try {
    const category = await backendFetch<CategoryListItem>("/categories", {
      method: "POST",
      body: { name, color },
    });

    revalidatePath("/products");

    return { ok: true, category };
  } catch (error) {
    if (error instanceof BackendError) {
      return { ok: false, error: error.message };
    }

    throw error;
  }
};

/** The whole makeup of a combo, sent on both create and full-replace edit. */
export interface ComboInput {
  categoryId: string | null;
  components: { productId: string; quantity: string }[];
  name: string;
  price: string;
  productType: string;
}

export const createComboAction = async (
  input: ComboInput
): Promise<ActionResult> =>
  run(() => backendFetch("/combos", { method: "POST", body: input }));

export const updateComboAction = async (
  comboId: string,
  input: ComboInput
): Promise<ActionResult> =>
  run(() => backendFetch(`/combos/${comboId}`, { method: "PUT", body: input }));

export const deleteComboAction = async (
  comboId: string
): Promise<ActionResult> =>
  run(() => backendFetch(`/combos/${comboId}`, { method: "DELETE" }));

export const updateCategoryAction = async (
  categoryId: string,
  name: string
): Promise<ActionResult> =>
  run(() =>
    backendFetch(`/categories/${categoryId}`, {
      method: "PATCH",
      body: { name },
    })
  );

export const deleteCategoryAction = async (
  categoryId: string
): Promise<ActionResult> =>
  run(() => backendFetch(`/categories/${categoryId}`, { method: "DELETE" }));
