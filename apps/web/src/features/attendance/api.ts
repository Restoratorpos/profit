import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch, apiPost } from "@/lib/api/client";
import type { AttendancePage, DoorState } from "./types";

export interface AttendanceFilters {
  from: string;
  page: number;
  pageSize: number;
  query: string;
  to: string;
}

export const attendanceKeys = {
  all: ["attendance"] as const,
  sessions: (filters: AttendanceFilters) =>
    [...attendanceKeys.all, "sessions", filters] as const,
  door: () => [...attendanceKeys.all, "door"] as const,
};

/** How often the door is asked what is happening at it. */
const DOOR_POLL_MS = 5000;

const toQuery = (filters: AttendanceFilters): string => {
  const params = new URLSearchParams({
    from: filters.from,
    page: String(filters.page),
    pageSize: String(filters.pageSize),
    to: filters.to,
  });

  if (filters.query.trim() !== "") {
    params.set("query", filters.query.trim());
  }

  return params.toString();
};

export const sessionsQuery = (filters: AttendanceFilters) =>
  queryOptions({
    queryKey: attendanceKeys.sessions(filters),
    queryFn: () =>
      apiFetch<AttendancePage>(`/attendance/sessions?${toQuery(filters)}`),
    placeholderData: keepPreviousData,
  });

export const useAttendanceSessions = (filters: AttendanceFilters) =>
  useQuery(sessionsQuery(filters));

/**
 * What is happening at the door, polled while the screen is open.
 *
 * One request on purpose: who is waiting on a decision, the newest scan, and
 * any scan the terminal accepted that this gym cannot name. A member the door
 * lets straight through never reaches the pending queue — `latestEvent` is what
 * tells the page a visit just happened.
 *
 * `refetchInterval` replaces the setInterval + ref-to-latest-callback the Next
 * version needed. Two differences that matter on a front desk:
 *
 * - Polling pauses when the tab is hidden and resumes on focus, so a terminal
 *   left on an unattended screen stops asking every five seconds all night.
 * - `staleTime: 0` because this is the one thing on the page that is *supposed*
 *   to be re-read constantly; someone is standing at the door.
 */
export const doorQuery = queryOptions({
  queryKey: attendanceKeys.door(),
  queryFn: () => apiFetch<DoorState>("/attendance/door"),
  refetchInterval: DOOR_POLL_MS,
  staleTime: 0,
});

export const useDoor = () => useQuery(doorQuery);

/**
 * Deciding a scan changes both the queue and the day's visit list, so every
 * write settles the whole feature. Members too: an accepted visit counts down
 * a membership's remaining entries.
 */
const useSettleAttendance = () => {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: attendanceKeys.all });
    queryClient.invalidateQueries({ queryKey: ["members"] });
  };
};

/** Takes the face behind an unrecognised scan off the terminal that saw it. */
export const useRemoveUnknownScan = () => {
  const settle = useSettleAttendance();

  return useMutation({
    mutationFn: () => apiPost<void>("/attendance/unknown/remove", {}),
    onSuccess: settle,
  });
};

export const useDecidePending = () => {
  const settle = useSettleAttendance();

  return useMutation({
    mutationFn: ({
      isAccepted,
      sessionId,
    }: {
      isAccepted: boolean;
      sessionId: number;
    }) => apiPost<void>(`/attendance/pending/${sessionId}`, { isAccepted }),
    onSuccess: settle,
  });
};

export const useRecordManualVisit = () => {
  const settle = useSettleAttendance();

  return useMutation({
    mutationFn: (memberId: string) =>
      apiPost<void>("/attendance/manual", { memberId }),
    onSuccess: settle,
  });
};
