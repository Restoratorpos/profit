/** Mirrors the shapes apps/backend returns from /devices and /attendance. */

import type { Messages } from "@/lib/i18n/dictionary";

export interface DeviceView {
  direction: string | null;
  /** How many people are enrolled on this terminal right now. */
  enrolledCount: number;
  id: string;
  ipAddress: string | null;
  isActive: boolean;
  /** ISO instant of the last successful contact, either way round. */
  lastSeen: string | null;
  location: string | null;
  name: string;
  port: number | null;
  username: string | null;
  /** The path the terminal should POST to. Carries its key — treat as secret. */
  webhookPath: string;
}

export interface DeviceInfo {
  deviceName: string | null;
  firmwareVersion: string | null;
  macAddress: string | null;
  model: string | null;
  serialNumber: string | null;
}

export interface EnrolledPerson {
  credentialId: string;
  issuedAt: string | null;
  name: string;
  personId: string;
  personType: string;
}

export interface AttendanceEventView {
  deviceName: string | null;
  direction: string | null;
  id: number;
  personId: string | null;
  personName: string | null;
  personType: string | null;
  source: string | null;
  time: string | null;
}

export interface SyncResult {
  ignored: number;
  read: number;
  recorded: number;
}

export const DEVICE_DIRECTIONS = ["both", "in", "out"] as const;

export type DeviceDirection = (typeof DEVICE_DIRECTIONS)[number];

export const directionLabel = (
  direction: string | null,
  messages: Messages
): string => {
  switch (direction) {
    case "in":
      return messages["devices.directionIn"];
    case "out":
      return messages["devices.directionOut"];
    default:
      return messages["devices.directionBoth"];
  }
};

/**
 * A terminal is "online" if it has been heard from recently. There is no
 * heartbeat to poll — `last_seen` is stamped by a scan or by a manual test — so
 * the window is generous on purpose: a quiet gym at 3am is not a fault.
 */
const ONLINE_WINDOW_MS = 15 * 60_000;

export const isOnline = (device: DeviceView, now = Date.now()): boolean => {
  if (!device.lastSeen) {
    return false;
  }

  const seen = new Date(device.lastSeen).getTime();

  return Number.isFinite(seen) && now - seen < ONLINE_WINDOW_MS;
};

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  month: "short",
});

export const formatWhen = (value: string | null): string => {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? "—" : DATE_TIME_FORMAT.format(parsed);
};

/*
 * Reading a picked photo lives in lib/images.ts — see `prepareFacePhoto`, which
 * also resizes it to something a terminal will actually accept. The image goes
 * straight through the server action to the device's own face library and is
 * never stored here, which is why there is no upload endpoint and no file
 * column anywhere.
 */
