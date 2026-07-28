"use server";

import { revalidatePath } from "next/cache";
import { BackendError, backendFetch } from "@/lib/backend";
import type { ActionResult } from "@/lib/catalog";
import type {
  MemberOrderDetail,
  OrderCheckoutType,
  OrderDetailResult,
  OrderEditInput,
  OrderPaymentType,
} from "@/lib/orders";

/** Every export must be declared `async` — "use server" is checked syntactically. */
const loadDetail = async (
  work: () => Promise<MemberOrderDetail>
): Promise<OrderDetailResult> => {
  try {
    return { ok: true, detail: await work() };
  } catch (error) {
    if (error instanceof BackendError) {
      return { ok: false, error: error.message };
    }

    throw error;
  }
};

/** Opens the drawer: the member's full order history, newest first. */
export const loadMemberOrdersAction = async (
  userId: string
): Promise<OrderDetailResult> =>
  loadDetail(() => backendFetch<MemberOrderDetail>(`/orders/member/${userId}`));

/**
 * Settles the member's whole outstanding balance by `amount`. Returns the fresh
 * detail so the drawer updates in place, and revalidates the list behind it so
 * the row's debt (or its disappearance from the unpaid tab) is correct on close.
 */
export const payMemberOrdersAction = async (
  userId: string,
  input: { amount: string; paymentType: OrderPaymentType }
): Promise<OrderDetailResult> => {
  const result = await loadDetail(() =>
    backendFetch<MemberOrderDetail>(`/orders/member/${userId}/pay`, {
      method: "POST",
      body: input,
    })
  );

  if (result.ok) {
    revalidatePath("/orders");
  }

  return result;
};

/**
 * Saves the edit sheet: line quantities, removed lines, and products appended to
 * the member's newest open order. Hands back the fresh detail so the sheet shows
 * exactly what was stored, and revalidates the list behind it — an edit moves
 * the member's debt, and can drop them off the unpaid tab entirely.
 */
export const editMemberOrderItemsAction = async (
  userId: string,
  input: OrderEditInput
): Promise<OrderDetailResult> => {
  const result = await loadDetail(() =>
    backendFetch<MemberOrderDetail>(`/orders/member/${userId}/items`, {
      method: "PATCH",
      body: input,
    })
  );

  if (result.ok) {
    revalidatePath("/orders");
  }

  return result;
};

/**
 * Deletes the member's whole open balance — every unsettled order is voided, the
 * stock returns, and the payments taken against those orders are voided with
 * them. Nothing is erased; the rows survive marked void.
 */
export const deleteMemberOrdersAction = async (
  userId: string
): Promise<OrderDetailResult> => {
  const result = await loadDetail(() =>
    backendFetch<MemberOrderDetail>(`/orders/member/${userId}`, {
      method: "DELETE",
    })
  );

  if (result.ok) {
    revalidatePath("/orders");
  }

  return result;
};

/** Rings up a new sale (POS). Revalidates the debt list a member sale feeds. */
export const createOrderAction = async (input: {
  /** Each item is a product or a combo — exactly one id, enforced server-side. */
  items: { comboId?: string; productId?: string; quantity: number }[];
  /**
   * How the sale is settled, in order — one leg for an ordinary sale, up to
   * three for a split. A leg with no amount takes whatever is still
   * outstanding, which the server works out from its own prices.
   */
  payments: { amount?: string; method: OrderCheckoutType }[];
  userId: string | null;
}): Promise<ActionResult> => {
  try {
    await backendFetch("/orders", { method: "POST", body: input });
    revalidatePath("/orders");

    return { ok: true };
  } catch (error) {
    if (error instanceof BackendError) {
      return { ok: false, error: error.message };
    }

    throw error;
  }
};
