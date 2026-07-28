import type { ActionResult } from "./catalog";

/** Mirrors what apps/backend returns from /plans. */
export interface PlanListItem {
  accessFrom: string | null;
  accessTo: string | null;
  billingType: string | null;
  branchId: string | null;
  description: string | null;
  duration: number | null;
  /** 0 means unlimited entries. */
  entryLimit: number;
  hallId: string | null;
  hallName: string | null;
  id: string;
  isActive: boolean;
  /** Non-zero means the plan cannot be deleted. */
  membershipCount: number;
  name: string;
  price: string | null;
  slots: number | null;
  trainerId: string | null;
  trainerName: string | null;
  /** ISO weekday numbers, 1 = Monday. Empty means the plan grants no entry. */
  weekdays: number[];
}

/** One person's membership on a plan. Mirrors GET /plans/:planId/members. */
export interface PlanMember {
  /** ISO timestamp, or null when the membership has no end date. */
  endsAt: string | null;
  id: string;
  membershipId: string;
  name: string;
  phone: string | null;
  /** Null on a duration plan, where visits are not counted down. */
  remainingVisits: number | null;
  startsAt: string | null;
  status: string | null;
}

export interface NamedOption {
  id: string;
  name: string;
}

export const BILLING_TYPES = ["recurring", "one_time"] as const;

export type BillingType = (typeof BILLING_TYPES)[number];

export type PlanActionResult = ActionResult;

/** ISO weekday numbers, Monday first — the order they are shown in. */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export const HOURS = Array.from({ length: 24 }, (_, index) =>
  String(index).padStart(2, "0")
);

export const MINUTES = ["00", "15", "30", "45"];

/** Splits "06:30" into its parts, falling back to the given default. */
export const splitTime = (
  value: string | null,
  fallback: string
): [string, string] => {
  const [hour, minute] = (value ?? fallback).split(":");

  return [hour ?? "00", minute ?? "00"];
};
