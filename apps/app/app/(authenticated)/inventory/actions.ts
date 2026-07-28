"use server";

import { revalidatePath } from "next/cache";
import { BackendError, backendFetch } from "@/lib/backend";
import type { ActionResult } from "@/lib/catalog";
import type {
  MovementView,
  PaymentMethod,
  SupplierSummary,
} from "@/lib/inventory";

/**
 * Every export here must be declared `async` — Next rejects a "use server"
 * module that exports a function merely *returning* a promise, because the
 * boundary is checked syntactically, not by return type.
 *
 * A stock document changes both what is on the shelf and what is owed, so every
 * one of these revalidates the suppliers screen as well as the stock table.
 */
const run = async (work: () => Promise<unknown>): Promise<ActionResult> => {
  try {
    await work();
    revalidatePath("/inventory");
    revalidatePath("/inventory/suppliers");
    revalidatePath("/inventory/history");

    return { ok: true };
  } catch (error) {
    if (error instanceof BackendError) {
      return { ok: false, error: error.message };
    }

    throw error;
  }
};

export interface StockActionInput {
  actionType: "in" | "return" | "writeoff";
  items: { productId: string; quantity: string; unitCost?: string }[];
  note?: string | null;
  paidAmount?: string;
  paymentMethod?: PaymentMethod;
  supplierId?: string | null;
}

export const createStockActionAction = async (
  input: StockActionInput
): Promise<ActionResult> =>
  run(() =>
    backendFetch("/inventory/actions", { method: "POST", body: input })
  );

export const createStocktakeAction = async (input: {
  items: { counted: string; productId: string }[];
  note?: string | null;
}): Promise<ActionResult> =>
  run(() =>
    backendFetch("/inventory/stocktakes", { method: "POST", body: input })
  );

export const voidStockActionAction = async (
  actionId: string
): Promise<ActionResult> =>
  run(() =>
    backendFetch(`/inventory/actions/${actionId}`, { method: "DELETE" })
  );

/**
 * One product's movements, for the drawer. It is an action rather than page
 * data because the drawer opens on a row the page already rendered — fetching
 * every product's history up front to serve the one row that gets opened would
 * be the bulk of the payload wasted.
 */
export const loadProductMovementsAction = async (
  productId: string
): Promise<{ error?: string; movements: MovementView[] }> => {
  try {
    const movements = await backendFetch<MovementView[]>(
      `/inventory/movements?productId=${encodeURIComponent(productId)}&limit=100`
    );

    return { movements };
  } catch (error) {
    if (error instanceof BackendError) {
      return { error: error.message, movements: [] };
    }

    throw error;
  }
};

/**
 * Returns the created row, not just ok/error: the delivery dialog creates a
 * supplier and then immediately selects it, and re-fetching the list to find it
 * by name would race with revalidation.
 */
export interface CreateSupplierResult extends ActionResult {
  supplier?: SupplierSummary;
}

export const createSupplierAction = async (input: {
  passport?: string | null;
  phone?: string | null;
  supplier: string;
  supplierType?: string | null;
}): Promise<CreateSupplierResult> => {
  try {
    const supplier = await backendFetch<SupplierSummary>("/suppliers", {
      method: "POST",
      body: input,
    });

    revalidatePath("/inventory");
    revalidatePath("/inventory/suppliers");

    return { ok: true, supplier };
  } catch (error) {
    if (error instanceof BackendError) {
      return { ok: false, error: error.message };
    }

    throw error;
  }
};

export const updateSupplierAction = async (
  supplierId: string,
  input: Record<string, unknown>
): Promise<ActionResult> =>
  run(() =>
    backendFetch(`/suppliers/${supplierId}`, { method: "PATCH", body: input })
  );

export const deleteSupplierAction = async (
  supplierId: string
): Promise<ActionResult> =>
  run(() => backendFetch(`/suppliers/${supplierId}`, { method: "DELETE" }));

export const paySupplierAction = async (
  supplierId: string,
  input: { amount: string; method: PaymentMethod; note?: string | null }
): Promise<ActionResult> =>
  run(() =>
    backendFetch(`/suppliers/${supplierId}/pay`, {
      method: "POST",
      body: input,
    })
  );
