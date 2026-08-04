import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { branches, gyms } from "../db/schema.js";
import { NotFoundError } from "../lib/errors.js";
import type { UpdateGymInput } from "../schemas/gym.js";

/**
 * The tenant's own row, and the branch whose opening hours the settings screen
 * edits.
 *
 * Hours live on `branches`, not on `gyms` — a chain opens its locations at
 * different times. There is one branch per gym today, so the screen presents
 * them as the gym's hours and this module resolves which branch that means.
 */

export interface GymBranchView {
  id: string;
  name: string;
}

export interface GymSettingsView {
  /** Every branch this gym has, oldest first — what the header's picker lists. */
  branches: GymBranchView[];
  /** Null only for a tenant with no branch row at all, which register() cannot produce. */
  branchId: string | null;
  branchName: string | null;
  closeTime: string | null;
  id: string;
  name: string;
  openTime: string | null;
  ownerName: string | null;
  phone: string | null;
  planTier: string | null;
}

/** MySQL TIME comes back "HH:MM:SS"; the UI wants "HH:MM". */
const toClock = (value: string | null): string | null =>
  value ? value.slice(0, 5) : null;

/**
 * The caller's own branch, falling back to the gym's oldest one.
 *
 * An owner has no `branchId` — they are gym-level staff — so without the
 * fallback the one person allowed to edit the hours would be the one person
 * with no branch to edit them on.
 */
const resolveBranch = async (gymId: string, branchId: string | null) => {
  const columns = {
    branchId: branches.branchId,
    name: branches.branch,
    openTime: branches.openTime,
    closeTime: branches.closeTime,
  };

  if (branchId) {
    const [own] = await db
      .select(columns)
      .from(branches)
      .where(and(eq(branches.gymId, gymId), eq(branches.branchId, branchId)))
      .limit(1);

    if (own) {
      return own;
    }
  }

  const [first] = await db
    .select(columns)
    .from(branches)
    .where(eq(branches.gymId, gymId))
    .orderBy(asc(branches.createdAt))
    .limit(1);

  return first ?? null;
};

export const getGymSettings = async (
  gymId: string,
  branchId: string | null
): Promise<GymSettingsView> => {
  // Independent queries: neither lookup needs anything the other returns, and
  // both are scoped by gymId.
  const [rows, branch, allBranches] = await Promise.all([
    db
      .select({
        gymId: gyms.gymId,
        name: gyms.gym,
        ownerName: gyms.ownerName,
        phone: gyms.phone,
        planTier: gyms.planTier,
      })
      .from(gyms)
      .where(eq(gyms.gymId, gymId))
      .limit(1),
    resolveBranch(gymId, branchId),
    db
      .select({ id: branches.branchId, name: branches.branch })
      .from(branches)
      .where(eq(branches.gymId, gymId))
      .orderBy(asc(branches.createdAt)),
  ]);

  const gym = rows[0];

  if (!gym) {
    throw new NotFoundError("Gym not found");
  }

  return {
    id: gym.gymId,
    name: gym.name ?? "",
    ownerName: gym.ownerName,
    phone: gym.phone,
    planTier: gym.planTier,
    branchId: branch?.branchId ?? null,
    branchName: branch?.name ?? null,
    branches: allBranches.map((row) => ({ id: row.id, name: row.name ?? "" })),
    openTime: toClock(branch?.openTime ?? null),
    closeTime: toClock(branch?.closeTime ?? null),
  };
};

export const updateGymSettings = async (
  gymId: string,
  branchId: string | null,
  input: UpdateGymInput
): Promise<GymSettingsView> => {
  const wantsHours =
    input.openTime !== undefined || input.closeTime !== undefined;

  const branch = wantsHours ? await resolveBranch(gymId, branchId) : null;

  if (wantsHours && !branch) {
    throw new NotFoundError("This gym has no branch to set hours on");
  }

  await db.transaction(async (tx) => {
    if (input.name !== undefined) {
      /*
       * Not checked against affectedRows: MySQL counts rows *changed*, so
       * saving the name a gym already has would look like a missing tenant. The
       * read below is what reports a row that genuinely is not there.
       */
      await tx
        .update(gyms)
        .set({ gym: input.name })
        .where(eq(gyms.gymId, gymId));
    }

    if (branch) {
      await tx
        .update(branches)
        .set({
          ...(input.openTime === undefined
            ? {}
            : { openTime: input.openTime ?? null }),
          ...(input.closeTime === undefined
            ? {}
            : { closeTime: input.closeTime ?? null }),
        })
        // gymId as well as the id: the branch was resolved under this tenant,
        // and the second predicate keeps that true in the statement itself.
        .where(
          and(eq(branches.gymId, gymId), eq(branches.branchId, branch.branchId))
        );
    }
  });

  return getGymSettings(gymId, branchId);
};
