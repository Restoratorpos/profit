import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiDelete, apiFetch, apiPatch, apiPost } from "@/lib/api/client";
import type { NamedOption, PlanInput, PlanListItem, PlanMember } from "./types";

/**
 * The plans vertical's data layer — what `plans/actions.ts` and the server
 * component's `backendFetch` calls were in the Next app.
 *
 * `revalidatePath("/plans")` maps onto `invalidateQueries({ queryKey: keys.all })`
 * one-for-one. Keeping that invalidation inside the mutation hooks rather than
 * at the call sites is the point: a component that forgets to invalidate leaves
 * a stale table, and on a shared front desk a stale table is two operators
 * disagreeing about what a plan costs.
 */

export const planKeys = {
  all: ["plans"] as const,
  list: () => [...planKeys.all, "list"] as const,
  members: (planId: string) => [...planKeys.all, planId, "members"] as const,
};

export const hallKeys = { all: ["halls"] as const };
export const trainerKeys = { all: ["trainers"] as const };

export const plansQuery = queryOptions({
  queryKey: planKeys.list(),
  queryFn: () => apiFetch<PlanListItem[]>("/plans"),
});

export const hallsQuery = queryOptions({
  queryKey: hallKeys.all,
  queryFn: () => apiFetch<NamedOption[]>("/halls"),
});

export const trainersQuery = queryOptions({
  queryKey: trainerKeys.all,
  queryFn: () => apiFetch<NamedOption[]>("/trainers"),
});

/**
 * Fetched only when a plan's member list is opened, never with the table.
 *
 * The Next version made the same call an on-demand action for the same reason:
 * most rows are never opened, and a gym with hundreds of memberships would
 * otherwise ship all of them for the one list the operator actually taps.
 */
export const usePlanMembers = (planId: string | null) =>
  useQuery({
    queryKey: planKeys.members(planId ?? ""),
    queryFn: () => apiFetch<PlanMember[]>(`/plans/${planId}/members`),
    enabled: planId !== null,
  });

/** Everything the plans page needs, in flight together rather than in sequence. */
export const usePlans = () => useQuery(plansQuery);
export const useHalls = () => useQuery(hallsQuery);
export const useTrainers = () => useQuery(trainersQuery);

const useInvalidatePlans = () => {
  const queryClient = useQueryClient();

  return () => queryClient.invalidateQueries({ queryKey: planKeys.all });
};

export const useSavePlan = () => {
  const invalidate = useInvalidatePlans();

  return useMutation({
    mutationFn: ({ planId, input }: { input: PlanInput; planId?: string }) =>
      planId
        ? apiPatch<PlanListItem>(`/plans/${planId}`, input)
        : apiPost<PlanListItem>("/plans", input),
    onSuccess: invalidate,
  });
};

/** The status badge in the table is the control, so it sends only this. */
export const useSetPlanActive = () => {
  const invalidate = useInvalidatePlans();

  return useMutation({
    mutationFn: ({ isActive, planId }: { isActive: boolean; planId: string }) =>
      apiPatch<void>(`/plans/${planId}/status`, { isActive }),
    onSuccess: invalidate,
  });
};

export const useDeletePlan = () => {
  const invalidate = useInvalidatePlans();

  return useMutation({
    mutationFn: (planId: string) => apiDelete(`/plans/${planId}`),
    onSuccess: invalidate,
  });
};

/** Returns the created row so the hall picker can select it immediately. */
export const useCreateHall = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) => apiPost<NamedOption>("/halls", { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: hallKeys.all }),
  });
};
