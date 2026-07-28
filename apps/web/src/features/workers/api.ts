import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch, apiPatch, apiPost } from "@/lib/api/client";
import type {
  SalaryPaymentInput,
  WorkerDetail,
  WorkerListItem,
  WorkerPage,
  WorkerPayroll,
  WorkerQuery,
} from "./types";

export interface RangeBounds {
  from: string;
  to: string;
}

export const workerKeys = {
  all: ["workers"] as const,
  page: (query: WorkerQuery, bounds: RangeBounds) =>
    [...workerKeys.all, "page", query, bounds] as const,
  detail: (workerId: string, bounds: RangeBounds) =>
    [...workerKeys.all, workerId, "detail", bounds] as const,
  payroll: (workerId: string, period: string) =>
    [...workerKeys.all, workerId, "payroll", period] as const,
};

export interface WorkerInput {
  fullname: string;
  hiredAt: string | null;
  phone: string;
  role: string;
  salaryAmount: string;
  salaryType: string;
  shiftEnd: string | null;
  shiftStart: string | null;
  workingDays: number[];
}

const toQuery = (query: WorkerQuery, bounds: RangeBounds): string => {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
    status: query.status,
  });

  if (bounds.from) {
    params.set("from", bounds.from);
  }

  if (bounds.to) {
    params.set("to", bounds.to);
  }

  if (query.query.trim().length > 0) {
    params.set("query", query.query.trim());
  }

  return params.toString();
};

/**
 * One page of the staff list.
 *
 * The date range is part of the key, not just the filter: the hours, earnings
 * and payments on every row are computed over it, so two ranges are two
 * different answers rather than the same list sorted differently.
 *
 * `keepPreviousData` holds the table steady while a new range or search loads —
 * the same reason the members roster needs it.
 */
export const workersPageQuery = (query: WorkerQuery, bounds: RangeBounds) =>
  queryOptions({
    queryKey: workerKeys.page(query, bounds),
    queryFn: () =>
      apiFetch<WorkerPage>(`/workers/page?${toQuery(query, bounds)}`),
    placeholderData: keepPreviousData,
  });

export const useWorkersPage = (query: WorkerQuery, bounds: RangeBounds) =>
  useQuery(workersPageQuery(query, bounds));

/** One worker's profile and attendance over the range the list is showing. */
export const useWorkerDetail = (workerId: string | null, bounds: RangeBounds) =>
  useQuery({
    queryKey: workerKeys.detail(workerId ?? "", bounds),
    queryFn: () =>
      apiFetch<WorkerDetail>(
        `/workers/${workerId}?${new URLSearchParams({ from: bounds.from, to: bounds.to }).toString()}`
      ),
    enabled: workerId !== null,
  });

/**
 * What one worker is owed for one month, and what has already been handed over.
 *
 * Keyed by a month rather than the list's date range: the pay window lets the
 * operator change which month they are settling, and the figures beside the
 * amount box have to follow that choice rather than the page's.
 */
export const useWorkerPayroll = (workerId: string | null, period: string) =>
  useQuery({
    queryKey: workerKeys.payroll(workerId ?? "", period),
    queryFn: () =>
      apiFetch<WorkerPayroll>(
        `/workers/${workerId}/payroll?${new URLSearchParams({ period }).toString()}`
      ),
    enabled: workerId !== null,
  });

const useInvalidateWorkers = () => {
  const queryClient = useQueryClient();

  return () => queryClient.invalidateQueries({ queryKey: workerKeys.all });
};

/**
 * Hands the created worker back: the face is enrolled in a second call that
 * needs the new id, and re-reading the list to find them by name would race
 * with the invalidation.
 */
export const useCreateWorker = () => {
  const invalidate = useInvalidateWorkers();

  return useMutation({
    mutationFn: (input: WorkerInput) =>
      apiPost<WorkerListItem>("/workers", input),
    onSuccess: invalidate,
  });
};

/** The backend's update schema is partial: send only what changed. */
export const useUpdateWorker = () => {
  const invalidate = useInvalidateWorkers();

  return useMutation({
    mutationFn: ({
      input,
      workerId,
    }: {
      input: Partial<WorkerInput>;
      workerId: string;
    }) => apiPatch<void>(`/workers/${workerId}`, input),
    onSuccess: invalidate,
  });
};

export const useSetWorkerActive = () => {
  const invalidate = useInvalidateWorkers();

  return useMutation({
    mutationFn: ({
      isActive,
      workerId,
    }: {
      isActive: boolean;
      workerId: string;
    }) => apiPost<void>(`/workers/${workerId}/active`, { isActive }),
    onSuccess: invalidate,
  });
};

/** `at` is an ISO instant; null checks in/out at the server's now. */
export const useCheckIn = () => {
  const invalidate = useInvalidateWorkers();

  return useMutation({
    mutationFn: ({ at, workerId }: { at: string | null; workerId: string }) =>
      apiPost<void>(`/workers/${workerId}/check-in`, at ? { at } : {}),
    onSuccess: invalidate,
  });
};

export const useCheckOut = () => {
  const invalidate = useInvalidateWorkers();

  return useMutation({
    mutationFn: ({ at, workerId }: { at: string | null; workerId: string }) =>
      apiPost<void>(`/workers/${workerId}/check-out`, at ? { at } : {}),
    onSuccess: invalidate,
  });
};

/** Hand a wage over. Writes one salary expense against `input.period`. */
export const usePayWorker = () => {
  const invalidate = useInvalidateWorkers();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      input,
      workerId,
    }: {
      input: SalaryPaymentInput;
      workerId: string;
    }) => apiPost<void>(`/workers/${workerId}/pay`, input),
    onSuccess: () => {
      invalidate();
      // A wage is money out of a till, so the ledger and its balances moved.
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
};
