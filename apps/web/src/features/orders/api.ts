import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiDelete, apiFetch, apiPatch, apiPost } from "@/lib/api/client";
import type {
  MemberOrderDetail,
  MemberOrderSummary,
  OrderCheckoutType,
  OrderEditInput,
  OrderPaymentType,
} from "./types";

export const orderKeys = {
  all: ["orders"] as const,
  list: () => [...orderKeys.all, "list"] as const,
  member: (userId: string) => [...orderKeys.all, "member", userId] as const,
};

export const ordersQuery = queryOptions({
  queryKey: orderKeys.list(),
  queryFn: () => apiFetch<MemberOrderSummary[]>("/orders"),
});

export const useOrders = () => useQuery(ordersQuery);

/** Opens the drawer: the member's full order history, newest first. */
export const useMemberOrders = (userId: string | null) =>
  useQuery({
    queryKey: orderKeys.member(userId ?? ""),
    queryFn: () => apiFetch<MemberOrderDetail>(`/orders/member/${userId}`),
    enabled: userId !== null,
  });

/**
 * Every write in the drawer hands back the member's fresh detail.
 *
 * That is worth preserving rather than flattening into an invalidate: the
 * server has already computed the detail, so writing it straight into the cache
 * updates the open drawer with no second round trip. The *list* behind it does
 * get invalidated — a payment or an edit moves the member's debt and can drop
 * them off the unpaid tab entirely, which is what `revalidatePath("/orders")`
 * was saying.
 */
const useSettleMemberOrders = (userId: string) => {
  const queryClient = useQueryClient();

  return (detail: MemberOrderDetail) => {
    queryClient.setQueryData(orderKeys.member(userId), detail);
    queryClient.invalidateQueries({ queryKey: orderKeys.list() });
    // A shop sale sits on the member's balance, so their row is stale too.
    queryClient.invalidateQueries({ queryKey: ["members"] });
  };
};

/** Settles the member's whole outstanding balance by `amount`. */
export const usePayMemberOrders = (userId: string) => {
  const settle = useSettleMemberOrders(userId);

  return useMutation({
    mutationFn: (input: { amount: string; paymentType: OrderPaymentType }) =>
      apiPost<MemberOrderDetail>(`/orders/member/${userId}/pay`, input),
    onSuccess: settle,
  });
};

/**
 * Saves the edit sheet: line quantities, removed lines, and products appended
 * to the member's newest open order.
 */
export const useEditMemberOrderItems = (userId: string) => {
  const settle = useSettleMemberOrders(userId);

  return useMutation({
    mutationFn: (input: OrderEditInput) =>
      apiPatch<MemberOrderDetail>(`/orders/member/${userId}/items`, input),
    onSuccess: settle,
  });
};

/**
 * Deletes the member's whole open balance — every unsettled order is voided,
 * the stock returns, and the payments taken against those orders are voided
 * with them. Nothing is erased; the rows survive marked void.
 */
export const useDeleteMemberOrders = (userId: string) => {
  const settle = useSettleMemberOrders(userId);

  return useMutation({
    mutationFn: () => apiDelete<MemberOrderDetail>(`/orders/member/${userId}`),
    onSuccess: settle,
  });
};

export interface CreateOrderInput {
  /** Each item is a product or a combo — exactly one id, enforced server-side. */
  items: { comboId?: string; productId?: string; quantity: number }[];
  /**
   * How the sale is settled, in order — one leg for an ordinary sale, up to
   * three for a split. A leg with no amount takes whatever is still
   * outstanding, which the server works out from its own prices.
   */
  payments: { amount?: string; method: OrderCheckoutType }[];
  userId: string | null;
}

/** Rings up a new sale (POS). */
export const useCreateOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateOrderInput) => apiPost<void>("/orders", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orderKeys.all });
      // Stock moved and, on a member sale, so did their balance.
      queryClient.invalidateQueries({ queryKey: ["members"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
  });
};
