"use server";

import { revalidatePath } from "next/cache";
import { BackendError, backendFetch } from "@/lib/backend";
import type { ActionResult } from "@/lib/catalog";
import type {
  MemberGender,
  MemberListItem,
  MemberPage,
  MemberQuery,
  PaymentType,
} from "@/lib/members";

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

/** Every export must be declared `async` — "use server" is checked syntactically. */
const run = async (work: () => Promise<unknown>): Promise<ActionResult> => {
  try {
    await work();
    revalidatePath("/members");

    return { ok: true };
  } catch (error) {
    if (error instanceof BackendError) {
      return { ok: false, error: error.message };
    }

    throw error;
  }
};

/**
 * Hands the created member back, not just ok/error: the face is enrolled in a
 * second call that needs the new id, and re-fetching the list to find them by
 * name would race with revalidation.
 */
export interface CreateMemberResult extends ActionResult {
  member?: MemberListItem;
}

export const createMemberAction = async (
  input: MemberInput
): Promise<CreateMemberResult> => {
  try {
    const member = await backendFetch<MemberListItem>("/members", {
      body: input,
      method: "POST",
    });

    revalidatePath("/members");

    return { member, ok: true };
  } catch (error) {
    if (error instanceof BackendError) {
      return { ok: false, error: error.message };
    }

    throw error;
  }
};

/*
 * Face enrolment used to live here, member-specific. It moved to
 * `@/lib/face-actions`, which takes a person type, once staff needed the same
 * six calls — a second copy keyed to "worker" is exactly how the two drift.
 */

/** Editing never touches the membership — that is a separate transaction. */
export const updateMemberAction = async (
  memberId: string,
  input: Omit<MemberInput, "membership">
): Promise<ActionResult> =>
  run(() =>
    backendFetch(`/members/${memberId}`, { method: "PATCH", body: input })
  );

/**
 * Removes the member and their face from every terminal in one call. The
 * backend refuses when there is money on record, and that refusal comes back as
 * `error` for the row to show — it is the answer, not a failure.
 */
export const deleteMemberAction = async (
  memberId: string
): Promise<ActionResult> =>
  run(() => backendFetch(`/members/${memberId}`, { method: "DELETE" }));

export const setMemberActiveAction = async (
  memberId: string,
  isActive: boolean
): Promise<ActionResult> =>
  run(() =>
    backendFetch(`/members/${memberId}/status`, {
      method: "PATCH",
      body: { isActive },
    })
  );

/**
 * One page of the roster, filtered and searched by apps/backend.
 *
 * The view calls this on every change to the query — hence the debounce on the
 * other side. Params are built here rather than by the caller so no screen can
 * ask for a page size the backend has not agreed to.
 */
export const loadMembersAction = async (
  query: MemberQuery
): Promise<MemberPage> => {
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

  return await backendFetch<MemberPage>(`/members/page?${params}`);
};
