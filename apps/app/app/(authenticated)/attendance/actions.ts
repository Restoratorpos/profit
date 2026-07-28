"use server";

import { revalidatePath } from "next/cache";
import type { AttendancePage, DoorState } from "@/lib/attendance";
import { BackendError, backendFetch } from "@/lib/backend";
import type { ActionResult } from "@/lib/catalog";

/**
 * Every export here must be declared `async` — Next rejects a "use server"
 * module that exports a function merely *returning* a promise.
 *
 * The list and the queue are actions rather than page props because both are
 * re-read without a navigation: the queue polls while somebody is standing at
 * the door, and the table re-queries on every filter change.
 */
const run = async (work: () => Promise<unknown>): Promise<ActionResult> => {
  try {
    await work();
    revalidatePath("/attendance");

    return { ok: true };
  } catch (error) {
    if (error instanceof BackendError) {
      return { ok: false, error: error.message };
    }

    throw error;
  }
};

export interface AttendanceFilters {
  from: string;
  page: number;
  pageSize: number;
  query: string;
  to: string;
}

export const loadAttendanceAction = async (
  filters: AttendanceFilters
): Promise<{ error?: string; page: AttendancePage }> => {
  const params = new URLSearchParams({
    from: filters.from,
    page: String(filters.page),
    pageSize: String(filters.pageSize),
    to: filters.to,
  });

  if (filters.query.trim() !== "") {
    params.set("query", filters.query.trim());
  }

  try {
    const page = await backendFetch<AttendancePage>(
      `/attendance/sessions?${params.toString()}`
    );

    return { page };
  } catch (error) {
    if (error instanceof BackendError) {
      return { error: error.message, page: { rows: [], total: 0, visits: 0 } };
    }

    throw error;
  }
};

/**
 * What is happening at the door, in one request: who is waiting on a decision,
 * the newest scan, and any scan the terminal accepted that this gym cannot
 * name. Polled every few seconds, so it is deliberately one round trip.
 *
 * A member the door lets straight through never reaches the pending queue —
 * `latestEvent` is what tells the page a visit just happened.
 */
export const loadDoorAction = async (): Promise<
  DoorState & { error?: string }
> => {
  try {
    return await backendFetch<DoorState>("/attendance/door");
  } catch (error) {
    if (error instanceof BackendError) {
      return {
        duplicateScan: null,
        error: error.message,
        latestEvent: null,
        pending: [],
        unknownScan: null,
      };
    }

    throw error;
  }
};

/** Takes the face behind an unrecognised scan off the terminal that saw it. */
export const removeUnknownScanAction = async (): Promise<ActionResult> =>
  run(() => backendFetch("/attendance/unknown/remove", { method: "POST" }));

export const decidePendingAction = async (
  sessionId: number,
  isAccepted: boolean
): Promise<ActionResult> =>
  run(() =>
    backendFetch(`/attendance/pending/${sessionId}`, {
      body: { isAccepted },
      method: "POST",
    })
  );

export const recordManualVisitAction = async (
  memberId: string
): Promise<ActionResult> =>
  run(() =>
    backendFetch("/attendance/manual", { body: { memberId }, method: "POST" })
  );
