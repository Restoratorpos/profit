import { and, asc, count, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db/index.js";
import {
  halls,
  ID_LENGTH,
  members,
  memberships,
  type Plan,
  plans,
  workers,
} from "../db/schema.js";
import { ConflictError, NotFoundError } from "../lib/errors.js";
import type {
  CreateHallInput,
  CreatePlanInput,
  UpdatePlanInput,
} from "../schemas/plan.js";

/** Every query filters by gymId. An unscoped one is a data leak, not a bug. */

/**
 * The daily entry window is stored in `plans.start` / `plans.end`, which are
 * DATETIME columns. Only the time of day is meaningful, so both are written on
 * this fixed date and the date part is ignored on the way out.
 *
 * This is a compromise: `gyms.sql` has no TIME columns for an access window,
 * and the database is provisioned out-of-band so adding one is not ours to do
 * unilaterally. If proper columns are added later, only these two helpers and
 * the schema definition change.
 */
const TIME_EPOCH = "2000-01-01";

const toDateTime = (value: string | null | undefined): Date | null =>
  value ? new Date(`${TIME_EPOCH}T${value}:00`) : null;

const toTimeString = (value: Date | null): string | null => {
  if (!value) {
    return null;
  }

  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");

  return `${hours}:${minutes}`;
};

const parseWeekdays = (value: string | null): number[] =>
  (value ?? "")
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7);

export interface PlanListItem {
  accessFrom: string | null;
  accessTo: string | null;
  billingType: string | null;
  branchId: string | null;
  description: string | null;
  duration: number | null;
  entryLimit: number;
  hallId: string | null;
  hallName: string | null;
  id: string;
  isActive: boolean;
  /** Live memberships pointing at this plan; drives whether it can be deleted. */
  membershipCount: number;
  name: string;
  price: string | null;
  slots: number | null;
  trainerId: string | null;
  trainerName: string | null;
  weekdays: number[];
}

export interface NamedOption {
  id: string;
  name: string;
}

export const listHalls = async (gymId: string): Promise<NamedOption[]> => {
  const rows = await db
    .select({ id: halls.hallId, name: halls.hall })
    .from(halls)
    .where(eq(halls.gymId, gymId))
    .orderBy(asc(halls.hall));

  return rows.map((row) => ({ id: row.id, name: row.name ?? "" }));
};

export const createHall = async (
  gymId: string,
  { name }: CreateHallInput
): Promise<NamedOption> => {
  const [existing] = await db
    .select({ hallId: halls.hallId })
    .from(halls)
    .where(and(eq(halls.gymId, gymId), eq(halls.hall, name)))
    .limit(1);

  if (existing) {
    throw new ConflictError("A hall with this name already exists");
  }

  const hallId = nanoid(ID_LENGTH);

  await db.insert(halls).values({
    hallId,
    gymId,
    branchId: null,
    hall: name,
    capacity: null,
    description: null,
    isActive: true,
    createdAt: new Date(),
  });

  return { id: hallId, name };
};

/** Staff who can be attached to a plan as its coach. */
export const listTrainers = async (gymId: string): Promise<NamedOption[]> => {
  const rows = await db
    .select({ id: workers.workerId, name: workers.fullname })
    .from(workers)
    .where(and(eq(workers.gymId, gymId), eq(workers.role, "trainer")))
    .orderBy(asc(workers.fullname));

  return rows.map((row) => ({ id: row.id, name: row.name ?? "" }));
};

const toItem = (
  row: Plan,
  extras: {
    membershipCount: number;
    trainerName: string | null;
    hallName: string | null;
  }
): PlanListItem => ({
  id: row.planId,
  name: row.plan ?? "",
  billingType: row.billingType,
  price: row.price,
  duration: row.duration,
  entryLimit: row.visitQty ?? 0,
  accessFrom: toTimeString(row.startsAt),
  accessTo: toTimeString(row.endsAt),
  weekdays: parseWeekdays(row.weekdays),
  trainerId: row.trainerId,
  trainerName: extras.trainerName,
  hallId: row.hallId,
  hallName: extras.hallName,
  slots: row.slots,
  description: row.description,
  branchId: row.branchId,
  isActive: row.isActive ?? true,
  membershipCount: extras.membershipCount,
});

export const listPlans = async (gymId: string): Promise<PlanListItem[]> => {
  const rows = await db
    .select({
      plan: plans,
      trainerName: workers.fullname,
      hallName: halls.hall,
    })
    .from(plans)
    .leftJoin(workers, eq(plans.trainerId, workers.workerId))
    .leftJoin(halls, eq(plans.hallId, halls.hallId))
    .where(eq(plans.gymId, gymId))
    .orderBy(asc(plans.plan));

  if (rows.length === 0) {
    return [];
  }

  // One grouped count for the whole page rather than a query per plan.
  const counts = await db
    .select({ planId: memberships.planId, total: count() })
    .from(memberships)
    .where(eq(memberships.gymId, gymId))
    .groupBy(memberships.planId);

  const byPlan = new Map(
    counts.map((row) => [row.planId, Number(row.total) || 0])
  );

  return rows.map(({ plan, trainerName, hallName }) =>
    toItem(plan, {
      membershipCount: byPlan.get(plan.planId) ?? 0,
      trainerName,
      hallName,
    })
  );
};

const assertPlanExists = async (
  gymId: string,
  planId: string
): Promise<void> => {
  const [row] = await db
    .select({ planId: plans.planId })
    .from(plans)
    .where(and(eq(plans.gymId, gymId), eq(plans.planId, planId)))
    .limit(1);

  if (!row) {
    throw new NotFoundError("Plan not found");
  }
};

/** Rejects an id belonging to another gym rather than silently storing it. */
const assertOwned = async (
  gymId: string,
  table: typeof halls | typeof workers,
  idColumn: typeof halls.hallId | typeof workers.workerId,
  gymColumn: typeof halls.gymId | typeof workers.gymId,
  id: string,
  message: string
): Promise<void> => {
  const [row] = await db
    .select({ id: idColumn })
    .from(table)
    .where(and(eq(gymColumn, gymId), eq(idColumn, id)))
    .limit(1);

  if (!row) {
    throw new NotFoundError(message);
  }
};

const writableFields = (input: CreatePlanInput | UpdatePlanInput) => ({
  plan: input.name,
  billingType: input.billingType,
  price: input.price,
  duration: input.duration,
  visitQty: input.entryLimit,
  startsAt: toDateTime(input.accessFrom),
  endsAt: toDateTime(input.accessTo),
  // Empty means the plan grants no gym entry at all, which is how the
  // "access allowed" toggle is represented — there is no spare boolean column.
  weekdays: input.weekdays.join(","),
  trainerId: input.trainerId ?? null,
  hallId: input.hallId ?? null,
  slots: input.slots ?? null,
  description: input.description ?? null,
  branchId: input.branchId ?? null,
  isActive: input.isActive,
});

const assertReferencesOwned = async (
  gymId: string,
  input: CreatePlanInput | UpdatePlanInput
): Promise<void> => {
  if (input.trainerId) {
    await assertOwned(
      gymId,
      workers,
      workers.workerId,
      workers.gymId,
      input.trainerId,
      "Trainer not found"
    );
  }

  if (input.hallId) {
    await assertOwned(
      gymId,
      halls,
      halls.hallId,
      halls.gymId,
      input.hallId,
      "Hall not found"
    );
  }
};

export const createPlan = async (
  gymId: string,
  input: CreatePlanInput
): Promise<PlanListItem> => {
  await assertReferencesOwned(gymId, input);

  const planId = nanoid(ID_LENGTH);

  await db.insert(plans).values({
    planId,
    gymId,
    ...writableFields(input),
    createdAt: new Date(),
  });

  const [created] = await db
    .select()
    .from(plans)
    .where(eq(plans.planId, planId))
    .limit(1);

  if (!created) {
    throw new NotFoundError("Plan not found");
  }

  return toItem(created, {
    membershipCount: 0,
    trainerName: null,
    hallName: null,
  });
};

export const updatePlan = async (
  gymId: string,
  planId: string,
  input: UpdatePlanInput
): Promise<void> => {
  // affectedRows counts *changed* rows, so a no-op save would look like a 404.
  await assertPlanExists(gymId, planId);
  await assertReferencesOwned(gymId, input);

  await db
    .update(plans)
    .set(writableFields(input))
    .where(and(eq(plans.gymId, gymId), eq(plans.planId, planId)));
};

export interface PlanMember {
  endsAt: string | null;
  id: string;
  membershipId: string;
  name: string;
  phone: string | null;
  remainingVisits: number | null;
  startsAt: string | null;
  status: string | null;
}

const toIsoDate = (value: Date | null): string | null =>
  value ? value.toISOString() : null;

/**
 * Who is on this plan. Driven by the membership rows, not the member rows: a
 * person with two memberships on the same plan is two entries here, because
 * each has its own dates and remaining visits.
 */
export const listPlanMembers = async (
  gymId: string,
  planId: string
): Promise<PlanMember[]> => {
  await assertPlanExists(gymId, planId);

  const rows = await db
    .select({
      membershipId: memberships.membershipId,
      memberId: memberships.memberId,
      startsAt: memberships.startsAt,
      endsAt: memberships.endsAt,
      remainingVisits: memberships.remainingVisits,
      status: memberships.status,
      name: members.fullname,
      phone: members.phone,
    })
    .from(memberships)
    .leftJoin(members, eq(memberships.memberId, members.memberId))
    .where(and(eq(memberships.gymId, gymId), eq(memberships.planId, planId)))
    // Soonest to expire first — that is the list a desk operator acts on.
    .orderBy(asc(memberships.endsAt));

  return rows.map((row) => ({
    membershipId: row.membershipId,
    id: row.memberId ?? "",
    name: row.name ?? "",
    phone: row.phone,
    status: row.status,
    startsAt: toIsoDate(row.startsAt),
    endsAt: toIsoDate(row.endsAt),
    remainingVisits: row.remainingVisits,
  }));
};

export const setPlanActive = async (
  gymId: string,
  planId: string,
  isActive: boolean
): Promise<void> => {
  await assertPlanExists(gymId, planId);

  await db
    .update(plans)
    .set({ isActive })
    .where(and(eq(plans.gymId, gymId), eq(plans.planId, planId)));
};

export const deletePlan = async (
  gymId: string,
  planId: string
): Promise<void> => {
  await assertPlanExists(gymId, planId);

  // No foreign keys exist in this database, so nothing else stops a delete from
  // orphaning live memberships. Deactivating is the right move for a retired
  // plan; deleting one that is in use is almost always a mistake.
  const [inUse] = await db
    .select({ membershipId: memberships.membershipId })
    .from(memberships)
    .where(and(eq(memberships.gymId, gymId), eq(memberships.planId, planId)))
    .limit(1);

  if (inUse) {
    throw new ConflictError(
      "This plan is used by existing memberships. Deactivate it instead."
    );
  }

  await db
    .delete(plans)
    .where(and(eq(plans.gymId, gymId), eq(plans.planId, planId)));
};
