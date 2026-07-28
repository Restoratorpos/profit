"use server";

import { revalidatePath } from "next/cache";
import { BackendError, backendFetch } from "@/lib/backend";
import type { ActionResult } from "@/lib/catalog";
import type {
  SalaryPaymentInput,
  WorkerDetail,
  WorkerDetailResult,
  WorkerListItem,
  WorkerPage,
  WorkerPayroll,
  WorkerPayrollResult,
  WorkerQuery,
} from "@/lib/workers";

/** Split out so no template literal has to survive a shell round trip. */
const WORKERS_PAGE_PATH = "/workers/page?";

/**
 * Every export must be declared `async` — "use server" is checked syntactically.
 * `run` turns a thrown BackendError into a message the form can render; anything
 * else is a real fault and reaches the error boundary.
 */
const run = async (work: () => Promise<unknown>): Promise<ActionResult> => {
  try {
    await work();
    revalidatePath("/workers");

    return { ok: true };
  } catch (error) {
    if (error instanceof BackendError) {
      return { ok: false, error: error.message };
    }

    throw error;
  }
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

/** The worker's detail (profile + attendance) for a date range, for the drawer. */
export const loadWorkerDetailAction = async (
  workerId: string,
  from: string,
  to: string
): Promise<WorkerDetailResult> => {
  try {
    const query = new URLSearchParams({ from, to }).toString();
    const detail = await backendFetch<WorkerDetail>(
      `/workers/${workerId}?${query}`
    );

    return { ok: true, detail };
  } catch (error) {
    if (error instanceof BackendError) {
      return { ok: false, error: error.message };
    }

    throw error;
  }
};

/**
 * What one worker is owed for one month, and what has already been handed over.
 *
 * Keyed by a month rather than the list screen's date range: the pay window
 * lets the operator change which month they are settling, and the figures
 * beside the amount box have to follow that choice rather than the page's.
 */
export const loadWorkerPayrollAction = async (
  workerId: string,
  period: string
): Promise<WorkerPayrollResult> => {
  try {
    const query = new URLSearchParams({ period }).toString();
    const payroll = await backendFetch<WorkerPayroll>(
      `/workers/${workerId}/payroll?${query}`
    );

    return { ok: true, payroll };
  } catch (error) {
    if (error instanceof BackendError) {
      return { ok: false, error: error.message };
    }

    throw error;
  }
};

/** Hand a wage over. Writes one salary expense against `input.period`. */
export const payWorkerAction = async (
  workerId: string,
  input: SalaryPaymentInput
): Promise<ActionResult> =>
  run(() =>
    backendFetch(`/workers/${workerId}/pay`, { method: "POST", body: input })
  );

/**
 * Hands the created worker back, not just ok/error: the face is enrolled in a
 * second call that needs the new id, and re-fetching the list to find them by
 * name would race with revalidation.
 */
export interface CreateWorkerResult extends ActionResult {
  worker?: WorkerListItem;
}

export const createWorkerAction = async (
  input: WorkerInput
): Promise<CreateWorkerResult> => {
  try {
    const worker = await backendFetch<WorkerListItem>("/workers", {
      body: input,
      method: "POST",
    });

    revalidatePath("/workers");

    return { ok: true, worker };
  } catch (error) {
    if (error instanceof BackendError) {
      return { ok: false, error: error.message };
    }

    throw error;
  }
};

/** The backend's update schema is partial: send only what changed. */
export const updateWorkerAction = async (
  workerId: string,
  input: Partial<WorkerInput>
): Promise<ActionResult> =>
  run(() =>
    backendFetch(`/workers/${workerId}`, { method: "PATCH", body: input })
  );

export const setWorkerActiveAction = async (
  workerId: string,
  isActive: boolean
): Promise<ActionResult> =>
  run(() =>
    backendFetch(`/workers/${workerId}/active`, {
      method: "POST",
      body: { isActive },
    })
  );

/** `at` is an ISO instant; omit to check in/out at the server's now. */
export const checkInAction = async (
  workerId: string,
  at: string | null
): Promise<ActionResult> =>
  run(() =>
    backendFetch(`/workers/${workerId}/check-in`, {
      method: "POST",
      body: at ? { at } : {},
    })
  );

export const checkOutAction = async (
  workerId: string,
  at: string | null
): Promise<ActionResult> =>
  run(() =>
    backendFetch(`/workers/${workerId}/check-out`, {
      method: "POST",
      body: at ? { at } : {},
    })
  );

/**
 * One page of the staff list, filtered and searched by apps/backend. The date
 * range rides along because the hours, earnings and payments on every row are
 * computed over it.
 */
export const loadWorkersAction = async (
  query: WorkerQuery,
  bounds: { from: string; to: string }
): Promise<WorkerPage> => {
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

  return await backendFetch<WorkerPage>(WORKERS_PAGE_PATH + params.toString());
};
