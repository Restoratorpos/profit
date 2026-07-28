import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiDelete, apiFetch, apiPatch, apiPost } from "@/lib/api/client";
import type {
  AttendanceEventView,
  DeviceDirection,
  DeviceInfo,
  DeviceView,
  EnrolledPerson,
  SyncResult,
} from "./types";

export const deviceKeys = {
  all: ["devices"] as const,
  list: () => [...deviceKeys.all, "list"] as const,
  people: (deviceId: string) =>
    [...deviceKeys.all, deviceId, "people"] as const,
};

export const doorEventKeys = {
  events: ["attendance", "events"] as const,
  inside: ["attendance", "inside"] as const,
};

export const devicesQuery = queryOptions({
  queryKey: deviceKeys.list(),
  queryFn: () => apiFetch<DeviceView[]>("/devices"),
});

export const recentEventsQuery = queryOptions({
  queryKey: doorEventKeys.events,
  queryFn: () => apiFetch<AttendanceEventView[]>("/attendance/events"),
});

export const insideCountQuery = queryOptions({
  queryKey: doorEventKeys.inside,
  queryFn: () => apiFetch<{ count: number }>("/attendance/inside"),
});

export const useDevices = () => useQuery(devicesQuery);
export const useRecentEvents = () => useQuery(recentEventsQuery);
export const useInsideCount = () => useQuery(insideCountQuery);

/** Who a given terminal currently holds a face for. Fetched when the panel opens. */
export const useEnrolledPeople = (deviceId: string | null) =>
  useQuery({
    queryKey: deviceKeys.people(deviceId ?? ""),
    queryFn: () => apiFetch<EnrolledPerson[]>(`/devices/${deviceId}/people`),
    enabled: deviceId !== null,
  });

export interface DeviceInput {
  direction?: DeviceDirection;
  ipAddress?: string;
  isActive?: boolean;
  location?: string | null;
  name?: string;
  /** Omitted on edit means "keep the stored one". */
  password?: string;
  port?: number;
  username?: string;
}

const useInvalidateDevices = () => {
  const queryClient = useQueryClient();

  return () => queryClient.invalidateQueries({ queryKey: deviceKeys.all });
};

export const useSaveDevice = () => {
  const invalidate = useInvalidateDevices();

  return useMutation({
    mutationFn: ({
      deviceId,
      input,
    }: {
      deviceId?: string;
      input: DeviceInput;
    }) =>
      deviceId
        ? apiPatch<void>(`/devices/${deviceId}`, input)
        : apiPost<void>("/devices", input),
    onSuccess: invalidate,
  });
};

export const useDeleteDevice = () => {
  const invalidate = useInvalidateDevices();

  return useMutation({
    mutationFn: (deviceId: string) => apiDelete(`/devices/${deviceId}`),
    onSuccess: invalidate,
  });
};

/*
 * The four below reach hardware over the LAN. They can take seconds and fail in
 * several distinguishable ways, so each resolves with what the terminal
 * actually said rather than a bare ok — "it did not work" is useless when the
 * question is which part of the connection is wrong. Callers use `mutateAsync`
 * and read the payload; a failure rejects with an ApiError carrying the
 * backend's message.
 */

/** Reaches the terminal and reports what it says it is. */
export const useTestDevice = () => {
  const invalidate = useInvalidateDevices();

  return useMutation({
    mutationFn: (deviceId: string) =>
      apiPost<DeviceInfo>(`/devices/${deviceId}/test`, {}),
    onSuccess: invalidate,
  });
};

export interface PushDestination {
  host: string;
  path: string;
  port: number;
}

/** Tells the terminal to POST its scans here from now on. */
export const useEnablePush = () =>
  useMutation({
    mutationFn: (deviceId: string) =>
      apiPost<PushDestination>(`/devices/${deviceId}/push`, {}),
  });

export const useOpenDoor = () =>
  useMutation({
    mutationFn: (deviceId: string) =>
      apiPost<void>(`/devices/${deviceId}/door`, {}),
  });

/** Pulls whatever the terminal buffered while nothing was listening. */
export const useSyncEvents = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      deviceId,
      hours = 24,
    }: {
      deviceId: string;
      hours?: number;
    }) => apiPost<SyncResult>(`/devices/${deviceId}/sync`, { hours }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deviceKeys.all });
      // A sync writes visits, so the attendance screens are stale too.
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
    },
  });
};

const useInvalidatePeople = (deviceId: string) => {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: deviceKeys.people(deviceId) });
    // hasFace on the member/worker row moves with it.
    queryClient.invalidateQueries({ queryKey: ["members"] });
    queryClient.invalidateQueries({ queryKey: ["workers"] });
  };
};

export const useEnrollPerson = (deviceId: string) => {
  const invalidate = useInvalidatePeople(deviceId);

  return useMutation({
    mutationFn: (input: {
      personId: string;
      personType: "member" | "worker";
      photo?: string;
    }) => apiPost<void>(`/devices/${deviceId}/people`, input),
    onSuccess: invalidate,
  });
};

export const useRevokePerson = (deviceId: string) => {
  const invalidate = useInvalidatePeople(deviceId);

  return useMutation({
    mutationFn: (credentialId: string) =>
      apiDelete(`/devices/${deviceId}/people/${credentialId}`),
    onSuccess: invalidate,
  });
};
