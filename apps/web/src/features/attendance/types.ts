/** Mirrors the shapes apps/backend returns from /attendance. */

import { formatPhone } from "@repo/auth/lib/countries";
import type { AttendanceEventView } from "@/features/devices/types";
import {
  formatDay,
  formatTime,
  NO_DATE,
  toDate,
  toDateInput,
} from "@/lib/date";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/dictionary";

export const DENIAL_REASONS = [
  "outside_hours",
  "wrong_weekday",
  "no_visits",
  "expired",
  "no_membership",
] as const;

export type DenialReason = (typeof DENIAL_REASONS)[number];

export interface PendingDecision {
  /** The plan's window, so the desk sees what they missed and by how much. */
  accessFrom: string | null;
  accessTo: string | null;
  at: string | null;
  memberId: string;
  name: string;
  phone: string | null;
  planName: string | null;
  reason: DenialReason;
  sessionId: number;
}

/**
 * A scan the terminal matched and the CRM could not: the door reported an id no
 * active credential in this gym owns. Usually a member deleted here whose face
 * is still on the device.
 */
export interface UnknownScan {
  at: string;
  deviceId: string;
  deviceName: string | null;
  employeeNo: string;
}

/**
 * The same person again inside the debounce window. The scan was dropped on
 * purpose — one arrival is one arrival — and this is what says so.
 */
export interface DuplicateScan {
  at: string;
  deviceName: string | null;
  name: string;
  /**
   * `debounce` — read twice while they pulled the door open. `inside` — already
   * counted in today; members here never scan out, so every later scan is this.
   */
  reason: "debounce" | "inside";
}

/** One poll of the door: everything the banner shows, as of one moment. */
export interface DoorState {
  duplicateScan: DuplicateScan | null;
  latestEvent: AttendanceEventView | null;
  pending: PendingDecision[];
  unknownScan: UnknownScan | null;
}

/** One member, not one entry: their last visit in the range and how many. */
export interface AttendanceRow {
  at: string | null;
  memberId: string;
  name: string;
  phone: string | null;
  /** Sessions left **as of now**, not as of any visit on this row. */
  remainingVisits: number | null;
  /** The member's own code (`A06`) — what the desk calls them by. */
  uniqueId: string | null;
  visits: number;
}

export interface AttendancePage {
  rows: AttendanceRow[];
  /** Members who came in the range — what the pager counts. */
  total: number;
  /** Visits across all of them — the header figure. */
  visits: number;
}

export const PAGE_SIZES = [25, 50, 100] as const;

export const reasonMessage = (
  reason: DenialReason,
  messages: Messages
): string => {
  switch (reason) {
    case "outside_hours":
      return messages["attendance.reasonOutsideHours"];
    case "wrong_weekday":
      return messages["attendance.reasonWrongWeekday"];
    case "no_visits":
      return messages["attendance.reasonNoVisits"];
    case "expired":
      return messages["attendance.reasonExpired"];
    default:
      return messages["attendance.reasonNoMembership"];
  }
};

/** `"26 iyul" / "12:14"` — the day and the clock, which is what a desk reads. */
export const formatEntry = (
  value: string | null,
  locale: Locale
): { day: string; time: string } => {
  const parsed = toDate(value);

  if (!parsed) {
    return { day: NO_DATE, time: "" };
  }

  return { day: formatDay(parsed, locale), time: formatTime(parsed) };
};

/** `"YYYY-MM-DD"` in local time — what the date inputs exchange. */
export { toDateInput } from "@/lib/date";

/** The instant a day starts and ends locally, for an inclusive range. */
export const dayStart = (value: string): Date => new Date(`${value}T00:00:00`);

export const dayEnd = (value: string): Date => new Date(`${value}T23:59:59`);

export type RangePreset = "month" | "today" | "week";

/** The three quick ranges above the table, as local dates. */
export const presetRange = (
  preset: RangePreset,
  now = new Date()
): { from: string; to: string } => {
  const to = toDateInput(now);

  if (preset === "today") {
    return { from: to, to };
  }

  const start = new Date(now);

  if (preset === "week") {
    // ISO weeks start on Monday; `getDay()` calls Sunday 0, hence the shift.
    start.setDate(now.getDate() - ((now.getDay() || 7) - 1));
  } else {
    start.setDate(1);
  }

  return { from: toDateInput(start), to };
};

/** One CSV cell, quoted so a name with a comma cannot shift every column. */
const csvCell = (value: string): string => `"${value.replace(/"/g, '""')}"`;

export const toCsv = (
  rows: readonly AttendanceRow[],
  messages: Messages,
  locale: Locale
): string => {
  const header = [
    messages["attendance.colId"],
    messages["attendance.colMember"],
    messages["suppliers.colPhone"],
    messages["attendance.colEntry"],
    messages["attendance.colVisits"],
    messages["attendance.colRemaining"],
  ]
    .map(csvCell)
    .join(",");

  const body = rows.map((row) => {
    const entry = formatEntry(row.at, locale);

    return [
      csvCell(row.uniqueId ?? ""),
      csvCell(row.name),
      csvCell(formatPhone(row.phone)),
      csvCell(`${entry.day} ${entry.time}`.trim()),
      csvCell(String(row.visits)),
      csvCell(row.remainingVisits === null ? "" : String(row.remainingVisits)),
    ].join(",");
  });

  return [header, ...body].join("\n");
};
