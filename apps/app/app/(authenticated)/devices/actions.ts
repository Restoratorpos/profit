"use server";

import { revalidatePath } from "next/cache";
import { BackendError, backendFetch } from "@/lib/backend";
import type { ActionResult } from "@/lib/catalog";
import type {
  DeviceDirection,
  DeviceInfo,
  EnrolledPerson,
  SyncResult,
} from "@/lib/devices";

/**
 * Every export here must be declared `async` — Next rejects a "use server"
 * module that exports a function merely *returning* a promise.
 *
 * Several of these reach out to hardware over the LAN and can take seconds or
 * fail outright, so the ones whose answer the operator needs return it rather
 * than just ok/error: "it did not work" is useless when the question is which
 * part of the connection is wrong.
 */
const run = async (work: () => Promise<unknown>): Promise<ActionResult> => {
  try {
    await work();
    revalidatePath("/devices");

    return { ok: true };
  } catch (error) {
    if (error instanceof BackendError) {
      return { ok: false, error: error.message };
    }

    throw error;
  }
};

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

export const createDeviceAction = async (
  input: DeviceInput
): Promise<ActionResult> =>
  run(() => backendFetch("/devices", { body: input, method: "POST" }));

export const updateDeviceAction = async (
  deviceId: string,
  input: DeviceInput
): Promise<ActionResult> =>
  run(() =>
    backendFetch(`/devices/${deviceId}`, { body: input, method: "PATCH" })
  );

export const deleteDeviceAction = async (
  deviceId: string
): Promise<ActionResult> =>
  run(() => backendFetch(`/devices/${deviceId}`, { method: "DELETE" }));

export interface TestResult extends ActionResult {
  info?: DeviceInfo;
}

/** Reaches the terminal and reports what it says it is. */
export const testDeviceAction = async (
  deviceId: string
): Promise<TestResult> => {
  try {
    const info = await backendFetch<DeviceInfo>(`/devices/${deviceId}/test`, {
      method: "POST",
    });

    revalidatePath("/devices");

    return { ok: true, info };
  } catch (error) {
    if (error instanceof BackendError) {
      return { ok: false, error: error.message };
    }

    throw error;
  }
};

export interface PushResult extends ActionResult {
  destination?: { host: string; path: string; port: number };
}

/** Tells the terminal to POST its scans here from now on. */
export const enablePushAction = async (
  deviceId: string
): Promise<PushResult> => {
  try {
    const destination = await backendFetch<{
      host: string;
      path: string;
      port: number;
    }>(`/devices/${deviceId}/push`, { method: "POST" });

    return { destination, ok: true };
  } catch (error) {
    if (error instanceof BackendError) {
      return { ok: false, error: error.message };
    }

    throw error;
  }
};

export const openDoorAction = async (deviceId: string): Promise<ActionResult> =>
  run(() => backendFetch(`/devices/${deviceId}/door`, { method: "POST" }));

export interface SyncActionResult extends ActionResult {
  result?: SyncResult;
}

/** Pulls whatever the terminal buffered while nothing was listening. */
export const syncEventsAction = async (
  deviceId: string,
  hours = 24
): Promise<SyncActionResult> => {
  try {
    const result = await backendFetch<SyncResult>(`/devices/${deviceId}/sync`, {
      body: { hours },
      method: "POST",
    });

    revalidatePath("/devices");

    return { ok: true, result };
  } catch (error) {
    if (error instanceof BackendError) {
      return { ok: false, error: error.message };
    }

    throw error;
  }
};

export const loadEnrolledAction = async (
  deviceId: string
): Promise<{ error?: string; people: EnrolledPerson[] }> => {
  try {
    const people = await backendFetch<EnrolledPerson[]>(
      `/devices/${deviceId}/people`
    );

    return { people };
  } catch (error) {
    if (error instanceof BackendError) {
      return { error: error.message, people: [] };
    }

    throw error;
  }
};

export const enrollPersonAction = async (
  deviceId: string,
  input: { personId: string; personType: "member" | "worker"; photo?: string }
): Promise<ActionResult> =>
  run(() =>
    backendFetch(`/devices/${deviceId}/people`, { body: input, method: "POST" })
  );

export const revokePersonAction = async (
  deviceId: string,
  credentialId: string
): Promise<ActionResult> =>
  run(() =>
    backendFetch(`/devices/${deviceId}/people/${credentialId}`, {
      method: "DELETE",
    })
  );
