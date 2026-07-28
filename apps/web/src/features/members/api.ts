import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiDelete, apiFetch, apiPatch, apiPost } from "@/lib/api/client";
import type {
  MemberGender,
  MemberListItem,
  MemberPage,
  MemberQuery,
  PaymentType,
} from "./types";

export const memberKeys = {
  all: ["members"] as const,
  page: (query: MemberQuery) => [...memberKeys.all, "page", query] as const,
};

export interface MembershipInput {
  /**
   * How the sale is settled, in order — one leg for an ordinary sale, up to
   * three for a split. A leg with no amount takes whatever is still
   * outstanding, which the server works out from the plan's own price.
   */
  payments: { amount?: string; method: PaymentType }[];
  planId: string;
  startsAt: string;
}

export interface MemberInput {
  birthdate: string | null;
  fullname: string;
  gender: MemberGender | null;
  /** Omitted when the operator only registers the person. */
  membership: MembershipInput | null;
  note: string | null;
  phone: string;
}

/**
 * Params are built here rather than by the caller, so no screen can ask for a
 * page size the backend has not agreed to.
 */
const toQuery = (query: MemberQuery): string => {
  const params = new URLSearchParams({
    filter: query.filter,
    page: String(query.page),
    pageSize: String(query.pageSize),
  });

  if (query.debt) {
    params.set("debt", query.debt);
  }

  if (query.query.trim().length > 0) {
    params.set("query", query.query.trim());
  }

  return params.toString();
};

/**
 * One page of the roster, keyed by the whole query.
 *
 * `placeholderData` keeps the previous page on screen while the next one loads.
 * Without it, typing in the search box blanks the table between keystrokes —
 * the roster runs to thousands of rows and every change is a server round trip,
 * so the flicker is constant rather than occasional.
 */
export const membersPageQuery = (query: MemberQuery) =>
  queryOptions({
    queryKey: memberKeys.page(query),
    queryFn: () => apiFetch<MemberPage>(`/members/page?${toQuery(query)}`),
    placeholderData: keepPreviousData,
  });

export const useMembersPage = (query: MemberQuery) =>
  useQuery(membersPageQuery(query));

const useInvalidateMembers = () => {
  const queryClient = useQueryClient();

  return () => queryClient.invalidateQueries({ queryKey: memberKeys.all });
};

/**
 * Hands the created member back, not just ok/error: the face is enrolled in a
 * second call that needs the new id, and re-fetching the list to find them by
 * name would race with the invalidation.
 */
export const useCreateMember = () => {
  const invalidate = useInvalidateMembers();

  return useMutation({
    mutationFn: (input: MemberInput) =>
      apiPost<MemberListItem>("/members", input),
    onSuccess: invalidate,
  });
};

/** Editing never touches the membership — that is a separate transaction. */
export const useUpdateMember = () => {
  const invalidate = useInvalidateMembers();

  return useMutation({
    mutationFn: ({
      input,
      memberId,
    }: {
      input: Omit<MemberInput, "membership">;
      memberId: string;
    }) => apiPatch<void>(`/members/${memberId}`, input),
    onSuccess: invalidate,
  });
};

/**
 * Removes the member and their face from every terminal in one call. The
 * backend refuses when there is money on record, and that refusal is the
 * answer the row shows — not a failure to hide.
 */
export const useDeleteMember = () => {
  const invalidate = useInvalidateMembers();

  return useMutation({
    mutationFn: (memberId: string) => apiDelete(`/members/${memberId}`),
    onSuccess: invalidate,
  });
};

export const useSetMemberActive = () => {
  const invalidate = useInvalidateMembers();

  return useMutation({
    mutationFn: ({
      isActive,
      memberId,
    }: {
      isActive: boolean;
      memberId: string;
    }) => apiPatch<void>(`/members/${memberId}/status`, { isActive }),
    onSuccess: invalidate,
  });
};
