"use server";

import { revalidatePath } from "next/cache";
import { BackendError, backendFetch } from "@/lib/backend";
import type { ActionResult } from "@/lib/catalog";
import type { NamedOption, PlanMember } from "@/lib/plans";

export interface PlanInput {
  accessFrom: string | null;
  accessTo: string | null;
  billingType: string;
  branchId: string | null;
  description: string | null;
  duration: number;
  entryLimit: number;
  hallId: string | null;
  isActive: boolean;
  name: string;
  price: string;
  slots: number | null;
  trainerId: string | null;
  weekdays: number[];
}

export interface CreateHallResult extends ActionResult {
  hall?: NamedOption;
}

export interface PlanMembersResult extends ActionResult {
  members?: PlanMember[];
}

/** Every export must be declared `async` — the "use server" boundary is checked syntactically. */
const run = async (work: () => Promise<unknown>): Promise<ActionResult> => {
  try {
    await work();
    revalidatePath("/plans");

    return { ok: true };
  } catch (error) {
    if (error instanceof BackendError) {
      return { ok: false, error: error.message };
    }

    throw error;
  }
};

export const createPlanAction = async (
  input: PlanInput
): Promise<ActionResult> =>
  run(() => backendFetch("/plans", { method: "POST", body: input }));

export const updatePlanAction = async (
  planId: string,
  input: PlanInput
): Promise<ActionResult> =>
  run(() => backendFetch(`/plans/${planId}`, { method: "PATCH", body: input }));

/** The status column in the table toggles with one tap, so it sends only this. */
export const setPlanActiveAction = async (
  planId: string,
  isActive: boolean
): Promise<ActionResult> =>
  run(() =>
    backendFetch(`/plans/${planId}/status`, {
      method: "PATCH",
      body: { isActive },
    })
  );

export const deletePlanAction = async (planId: string): Promise<ActionResult> =>
  run(() => backendFetch(`/plans/${planId}`, { method: "DELETE" }));

/**
 * Fetched on demand rather than sent with the plans list: most rows are never
 * opened, and a gym with hundreds of memberships would otherwise serialize all
 * of them into the page for the one list the operator actually taps.
 */
export const listPlanMembersAction = async (
  planId: string
): Promise<PlanMembersResult> => {
  try {
    const members = await backendFetch<PlanMember[]>(
      `/plans/${planId}/members`
    );

    return { ok: true, members };
  } catch (error) {
    if (error instanceof BackendError) {
      return { ok: false, error: error.message };
    }

    throw error;
  }
};

/** Returns the created row so the hall picker can select it immediately. */
export const createHallAction = async (
  name: string
): Promise<CreateHallResult> => {
  try {
    const hall = await backendFetch<NamedOption>("/halls", {
      method: "POST",
      body: { name },
    });

    revalidatePath("/plans");

    return { ok: true, hall };
  } catch (error) {
    if (error instanceof BackendError) {
      return { ok: false, error: error.message };
    }

    throw error;
  }
};
