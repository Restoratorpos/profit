import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db/index.js";
import {
  attendanceEvents,
  attendanceSessions,
  credentials,
  ID_LENGTH,
  income,
  members,
  memberships,
  orders,
  plans,
} from "../db/schema.js";
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from "../lib/errors.js";
import type {
  CreateMemberInput,
  MemberQueryInput,
  MembershipPaymentLeg,
  UpdateMemberInput,
} from "../schemas/member.js";
import { purgeFaceEverywhere } from "./device.service.js";

/** Every query filters by gymId. An unscoped one is a data leak, not a bug. */

/** One plan a member holds, with how many memberships of it they have. */
export interface MemberPlanBadge {
  count: number;
  name: string;
}

export interface MemberListItem {
  birthdate: string | null;
  branchId: string | null;
  /** Earliest start across their memberships. */
  endsAt: string | null;
  gender: string | null;
  /** True when a face is enrolled on at least one terminal. */
  hasFace: boolean;
  id: string;
  isActive: boolean;
  /** Owed on memberships: what was sold, minus what has been paid. */
  membershipDebt: string;
  name: string;
  phone: string | null;
  plans: MemberPlanBadge[];
  /** Visits left across every membership; null when none are visit-counted. */
  remainingVisits: number | null;
  /** Owed in the shop: unsettled orders. */
  shopDebt: string;
  startsAt: string | null;
  uniqueId: string | null;
}

const toIsoDate = (value: Date | string | null): string | null => {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : String(value);
};

const toMoney = (value: number): string => value.toFixed(2);

/** MySQL returns DECIMAL as a string; SUM() of nothing comes back null. */
const toNumber = (value: string | number | null): number => {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed) ? parsed : 0;
};

const earlier = (a: Date | null, b: Date | null): Date | null => {
  if (!a) {
    return b;
  }

  if (!b) {
    return a;
  }

  return a < b ? a : b;
};

const later = (a: Date | null, b: Date | null): Date | null => {
  if (!a) {
    return b;
  }

  if (!b) {
    return a;
  }

  return a > b ? a : b;
};

interface Aggregate {
  endsAt: Date | null;
  paid: number;
  plans: Map<string, number>;
  remainingVisits: number | null;
  sold: number;
  startsAt: Date | null;
}

const emptyAggregate = (): Aggregate => ({
  endsAt: null,
  paid: 0,
  plans: new Map(),
  remainingVisits: null,
  sold: 0,
  startsAt: null,
});

/**
 * The list is built from four grouped queries rather than a query per member:
 * a gym with a thousand members would otherwise issue thousands of round trips
 * to render one screen.
 */
export const listMembers = async (gymId: string): Promise<MemberListItem[]> => {
  const rows = await db
    .select()
    .from(members)
    .where(eq(members.gymId, gymId))
    .orderBy(asc(members.fullname));

  if (rows.length === 0) {
    return [];
  }

  const membershipRows = await db
    .select({
      membershipId: memberships.membershipId,
      memberId: memberships.memberId,
      price: memberships.price,
      startsAt: memberships.startsAt,
      endsAt: memberships.endsAt,
      remainingVisits: memberships.remainingVisits,
      planName: plans.plan,
    })
    .from(memberships)
    .leftJoin(plans, eq(memberships.planId, plans.planId))
    .where(eq(memberships.gymId, gymId));

  const membershipIds = membershipRows.map((row) => row.membershipId);

  // Voided rows are corrections, not payments — counting them would wipe out a
  // debt that is still owed.
  const paidRows =
    membershipIds.length > 0
      ? await db
          .select({
            targetId: income.targetId,
            total: sql<string>`SUM(${income.amount})`,
          })
          .from(income)
          .where(
            and(
              eq(income.gymId, gymId),
              isNull(income.voidedAt),
              inArray(income.targetId, membershipIds)
            )
          )
          .groupBy(income.targetId)
      : [];

  const paidByMembership = new Map(
    paidRows.map((row) => [row.targetId, toNumber(row.total)])
  );

  /*
   * `settled_at IS NULL` is the debt signal rather than a status string: the
   * status vocabulary in this database is not ours to assume, while the
   * timestamp is unambiguous. `user_type` is part of the filter because an
   * order can belong to a worker, and worker ids share the same id space.
   */
  const shopRows = await db
    .select({
      userId: orders.userId,
      total: sql<string>`SUM(${orders.totalPrice})`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.gymId, gymId),
        eq(orders.userType, "member"),
        isNull(orders.settledAt),
        ne(orders.status, "void")
      )
    )
    .groupBy(orders.userId);

  const shopDebtByMember = new Map(
    shopRows.map((row) => [row.userId, toNumber(row.total)])
  );

  // Partial payments against orders live in `income` (category 'order'), joined
  // to their still-open order so a payment that already settled a past debt
  // does not keep discounting a new one. Subtracting them here keeps this
  // figure identical to what the orders screen shows.
  const shopPaidRows = await db
    .select({
      userId: orders.userId,
      paid: sql<string>`SUM(${income.amount})`,
    })
    .from(income)
    .innerJoin(
      orders,
      and(eq(orders.gymId, income.gymId), eq(orders.orderId, income.targetId))
    )
    .where(
      and(
        eq(income.gymId, gymId),
        eq(income.category, "order"),
        isNull(income.voidedAt),
        isNull(orders.settledAt),
        eq(orders.userType, "member"),
        ne(orders.status, "void")
      )
    )
    .groupBy(orders.userId);

  const shopPaidByMember = new Map(
    shopPaidRows.map((row) => [row.userId, toNumber(row.paid)])
  );

  // Who has a face on a terminal. One grouped read rather than a join, so a gym
  // with no terminals pays nothing for the column.
  const faceRows = await db
    .select({ ownerId: credentials.ownerId })
    .from(credentials)
    .where(
      and(
        eq(credentials.gymId, gymId),
        eq(credentials.ownerType, "member"),
        eq(credentials.isActive, true)
      )
    );

  const enrolled = new Set(
    faceRows.map((row) => row.ownerId).filter((id): id is string => Boolean(id))
  );

  const byMember = new Map<string, Aggregate>();

  for (const row of membershipRows) {
    if (!row.memberId) {
      continue;
    }

    const current = byMember.get(row.memberId) ?? emptyAggregate();

    current.sold += toNumber(row.price);
    current.paid += paidByMembership.get(row.membershipId) ?? 0;
    current.startsAt = earlier(current.startsAt, row.startsAt);
    current.endsAt = later(current.endsAt, row.endsAt);

    if (row.remainingVisits !== null) {
      current.remainingVisits =
        (current.remainingVisits ?? 0) + row.remainingVisits;
    }

    const name = row.planName ?? "";

    if (name.length > 0) {
      current.plans.set(name, (current.plans.get(name) ?? 0) + 1);
    }

    byMember.set(row.memberId, current);
  }

  return rows.map((row) => {
    const aggregate = byMember.get(row.memberId) ?? emptyAggregate();

    return {
      id: row.memberId,
      name: row.fullname ?? "",
      phone: row.phone,
      gender: row.gender,
      birthdate: toIsoDate(row.birthdate),
      uniqueId: row.uniqueId,
      branchId: row.homeBranch,
      hasFace: enrolled.has(row.memberId),
      isActive: row.status !== "inactive",
      plans: [...aggregate.plans].map(([name, count]) => ({ name, count })),
      startsAt: toIsoDate(aggregate.startsAt),
      endsAt: toIsoDate(aggregate.endsAt),
      remainingVisits: aggregate.remainingVisits,
      // A credit balance is not a negative debt as far as this screen cares.
      membershipDebt: toMoney(Math.max(aggregate.sold - aggregate.paid, 0)),
      shopDebt: toMoney(
        Math.max(
          (shopDebtByMember.get(row.memberId) ?? 0) -
            (shopPaidByMember.get(row.memberId) ?? 0),
          0
        )
      ),
    };
  });
};

/**
 * How little is left before a membership counts as running out.
 *
 * Tuned for the monthly plan this gym sells, which is twenty sessions: five
 * sessions is roughly the last week of training at three or four visits a week,
 * and seven days is that same week measured the other way.
 */
export const EXPIRING_VISITS = 5;
export const EXPIRING_DAYS = 7;

const MS_PER_DAY = 86_400_000;

/**
 * Ending, not ended. A membership with no sessions left, or whose date has
 * already passed, is finished — including it would turn a list the desk works
 * through into an archive that only ever grows.
 */
const isExpiringSoon = (member: MemberListItem, now: Date): boolean => {
  const visits = member.remainingVisits;

  if (visits !== null && visits > 0 && visits <= EXPIRING_VISITS) {
    return true;
  }

  if (!member.endsAt) {
    return false;
  }

  const ends = new Date(member.endsAt);

  if (Number.isNaN(ends.getTime())) {
    return false;
  }

  const days = Math.ceil((ends.getTime() - now.getTime()) / MS_PER_DAY);

  return days >= 0 && days <= EXPIRING_DAYS;
};

const owesMembership = (member: MemberListItem): boolean =>
  Number(member.membershipDebt) > 0;

const owesShop = (member: MemberListItem): boolean =>
  Number(member.shopDebt) > 0;

const matchesStatus = (
  member: MemberListItem,
  filter: MemberQueryInput["filter"],
  now: Date
): boolean => {
  if (filter === "active") {
    return member.isActive;
  }

  if (filter === "inactive") {
    return !member.isActive;
  }

  if (filter === "expiring") {
    return isExpiringSoon(member, now);
  }

  return true;
};

const matchesDebt = (
  member: MemberListItem,
  debt: MemberQueryInput["debt"]
): boolean => {
  if (!debt) {
    return true;
  }

  if (debt === "membership") {
    return owesMembership(member);
  }

  if (debt === "shop") {
    return owesShop(member);
  }

  return owesMembership(member) || owesShop(member);
};

/**
 * One box, three fields: a code ("A06"), a phone, or a name. The phone is
 * compared as bare digits on both sides, because it is displayed grouped — a
 * search typed the way it reads would otherwise never match.
 */
const matchesQuery = (member: MemberListItem, needle: string): boolean => {
  if (needle.length === 0) {
    return true;
  }

  const digits = needle.replace(/\D/g, "");

  return (
    member.name.toLowerCase().includes(needle) ||
    (member.uniqueId ?? "").toLowerCase().includes(needle) ||
    (digits.length > 0 && (member.phone ?? "").includes(digits))
  );
};

export interface MemberCounts {
  debt: { any: number; membership: number; shop: number };
  status: { active: number; all: number; expiring: number; inactive: number };
}

export interface MemberPage {
  /** Over the whole roster, not the page — these label the filters. */
  counts: MemberCounts;
  rows: MemberListItem[];
  /** Rows matching the filters, before paging. */
  total: number;
}

/**
 * The list screen's query: search, both filters and the page, all answered here
 * so the browser receives one page instead of the roster.
 *
 * Filtering happens over the assembled rows rather than in SQL, because the two
 * things worth filtering on — what a member owes, and when their membership
 * runs out — are summed across memberships, income and orders by `listMembers`
 * rather than stored anywhere. Expressing that as a WHERE clause would mean a
 * second copy of the money arithmetic, and a balance that disagrees with itself
 * between two screens is a worse bug than a query reading more rows than it
 * returns. Move it into SQL when a gym's roster makes that pay, not before.
 */
export const pageMembers = async (
  gymId: string,
  query: MemberQueryInput
): Promise<MemberPage> => {
  const all = await listMembers(gymId);
  const now = new Date();
  const needle = (query.query ?? "").trim().toLowerCase();

  const counts: MemberCounts = {
    debt: { any: 0, membership: 0, shop: 0 },
    status: { active: 0, all: all.length, expiring: 0, inactive: 0 },
  };

  const matched: MemberListItem[] = [];

  // One pass for every tally and the filtering, rather than a sweep per count.
  for (const member of all) {
    if (member.isActive) {
      counts.status.active += 1;
    } else {
      counts.status.inactive += 1;
    }

    if (isExpiringSoon(member, now)) {
      counts.status.expiring += 1;
    }

    const membership = owesMembership(member);
    const shop = owesShop(member);

    if (membership) {
      counts.debt.membership += 1;
    }

    if (shop) {
      counts.debt.shop += 1;
    }

    if (membership || shop) {
      counts.debt.any += 1;
    }

    if (
      matchesStatus(member, query.filter, now) &&
      matchesDebt(member, query.debt) &&
      matchesQuery(member, needle)
    ) {
      matched.push(member);
    }
  }

  const start = (query.page - 1) * query.pageSize;

  return {
    counts,
    rows: matched.slice(start, start + query.pageSize),
    total: matched.length,
  };
};

const assertMemberExists = async (
  gymId: string,
  memberId: string
): Promise<void> => {
  const [row] = await db
    .select({ memberId: members.memberId })
    .from(members)
    .where(and(eq(members.gymId, gymId), eq(members.memberId, memberId)))
    .limit(1);

  if (!row) {
    throw new NotFoundError("Member not found");
  }
};

/** Start of day, so a membership bought at 19:00 still covers that whole day. */
const toStartOfDay = (isoDate: string): Date => new Date(`${isoDate}T00:00:00`);

const addDays = (from: Date, days: number): Date => {
  const result = new Date(from);

  result.setDate(result.getDate() + days);

  return result;
};

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Writes the membership row and, when money actually changed hands, the income
 * row that pays for it. Runs inside the caller's transaction — never on its
 * own — so a failure here also rolls back the member.
 */
/** One income row a membership sale should write: a method and what it took. */
export interface MembershipSettlementRow {
  amount: number;
  method: string;
}

/** Below this, a shortfall is decimal noise rather than money anybody owes. */
const SETTLED_EPSILON = 0.005;

/**
 * What a plan sale charges, collects, and leaves owing.
 *
 * Pure, and exported for that reason: it is the one calculation here that
 * quietly gets money wrong, so it is tested for real rather than through a mock.
 *
 * The legs are walked in the order the desk entered them, each taking what it
 * asks for or — with no amount — whatever is still outstanding, and each capped
 * at what is actually left so an overpayment never books a credit. Every paying
 * leg becomes its own income row: a cashbox balance is `SUM(income.amount)`
 * grouped by `payment_type`, and a split booked once would fill one drawer
 * while leaving the other short.
 *
 * `debt` and `free` take nothing and end the walk. The difference between them
 * is `charged`, which is what goes in `memberships.price` and is not always the
 * plan's list price: a comp is stored at zero and a discounted sale at what was
 * actually taken, because the member's debt is `price - SUM(paid)` and leaving
 * the list price on either would chase somebody forever for money nobody
 * intends to collect.
 */
export const settleMembership = (
  listPrice: number,
  legs: readonly MembershipPaymentLeg[]
): { charged: number; rows: MembershipSettlementRow[] } => {
  const rows: MembershipSettlementRow[] = [];
  let outstanding = listPrice;
  let isWaived = false;

  for (const leg of legs) {
    if (outstanding <= SETTLED_EPSILON || leg.method === "debt") {
      break;
    }

    if (leg.method === "free") {
      isWaived = true;
      break;
    }

    const asked = leg.amount == null ? outstanding : Number(leg.amount);
    const taken = Math.max(0, Math.min(asked, outstanding));

    if (taken > 0) {
      rows.push({ amount: taken, method: leg.method });
      outstanding -= taken;
    }
  }

  return { charged: isWaived ? listPrice - outstanding : listPrice, rows };
};

const sellMembership = async (
  tx: Transaction,
  {
    gymId,
    input,
    memberId,
    now,
    workerId,
  }: {
    gymId: string;
    input: CreateMemberInput;
    memberId: string;
    now: Date;
    workerId: string;
  }
): Promise<void> => {
  if (!input.membership) {
    return;
  }

  const [plan] = await tx
    .select()
    .from(plans)
    .where(
      and(eq(plans.gymId, gymId), eq(plans.planId, input.membership.planId))
    )
    .limit(1);

  if (!plan) {
    throw new NotFoundError("Plan not found");
  }

  const membershipId = nanoid(ID_LENGTH);
  const startsAt = toStartOfDay(input.membership.startsAt);
  const visits = plan.visitQty ?? 0;

  const { charged, rows } = settleMembership(
    Number(plan.price ?? 0),
    input.membership.payments
  );

  await tx.insert(memberships).values({
    membershipId,
    gymId,
    memberId,
    planId: plan.planId,
    /*
     * A comped membership is stored at zero, not at the plan's list price.
     * Storing the list price would leave `price - paid` looking like an unpaid
     * balance forever, and the debt column would chase a member who was never
     * charged. What was actually charged is zero — and on a part-discounted
     * sale, what was actually charged is what they handed over.
     */
    price: charged.toFixed(2),
    startsAt,
    endsAt: plan.duration ? addDays(startsAt, plan.duration) : null,
    // 0 on the plan means unlimited, which is stored as "not counted".
    remainingVisits: visits > 0 ? visits : null,
    totalVisits: visits > 0 ? visits : null,
    status: "active",
    lastVisit: null,
    createdAt: now,
    createdBy: workerId,
  });

  /*
   * One row per method that actually took money, so each till is credited with
   * its own share — see `settleMembership` for which rows those are.
   *
   * A sale where no money changed hands writes none at all. `qarz` is a sale
   * awaiting payment (price stands, nothing paid, debt owed) and `to'lovsiz` is
   * a gift (price zero, nothing paid, nothing owed) — the difference between
   * them lives in the price above, not here.
   */
  for (const row of rows) {
    await tx.insert(income).values({
      gymId,
      branchId: input.branchId ?? null,
      category: "membership",
      targetId: membershipId,
      memberId,
      amount: row.amount.toFixed(2),
      paymentType: row.method,
      paidAt: now,
      voidedAt: null,
      voidedBy: null,
      // NOT NULL in this table: every payment is attributable to an operator.
      createdBy: workerId,
      note: null,
    });
  }
};

/**
 * Short, human-facing member codes: one uppercase letter and two digits, handed
 * out in order — A00, A01 … A99, B00 … Z99 — so the desk can call a member "A34"
 * rather than read out a 20-char id. Assigned once and never edited. Two digits
 * per letter is 2600 codes a gym; past that a member is simply left codeless
 * rather than fail the sale. Only these well-formed codes count toward the max,
 * so a legacy card number of another shape never derails the sequence.
 */
const MEMBER_CODE_REGEXP = "^[A-Z][0-9][0-9]$";

/** The code that follows `current`, or null once A00…Z99 is spent. */
const codeAfter = (current: string | null): string | null => {
  if (!current) {
    return "A00";
  }

  const digits = Number(current.slice(1));

  if (digits < 99) {
    return current[0] + String(digits + 1).padStart(2, "0");
  }

  const letter = current.charCodeAt(0);

  if (letter >= "Z".charCodeAt(0)) {
    return null;
  }

  return `${String.fromCharCode(letter + 1)}00`;
};

/**
 * The next free code for a gym, from the highest one already handed out. Runs
 * inside the create transaction so two desks ringing up members back to back
 * read each other's latest code rather than both landing on the same one.
 */
const nextMemberCode = async (
  tx: Transaction,
  gymId: string
): Promise<string | null> => {
  const [row] = await tx
    .select({ max: sql<string | null>`MAX(${members.uniqueId})` })
    .from(members)
    .where(
      and(
        eq(members.gymId, gymId),
        sql`${members.uniqueId} REGEXP ${MEMBER_CODE_REGEXP}`
      )
    );

  return codeAfter(row?.max ?? null);
};

/**
 * Creates the member and, when one was chosen, the membership and its payment
 * in a single transaction — a member who exists without the plan they just paid
 * for is worse than a failed save the operator can retry.
 */
export const createMember = async (
  gymId: string,
  input: CreateMemberInput,
  workerId: string | null
): Promise<MemberListItem> => {
  const memberId = nanoid(ID_LENGTH);
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx.insert(members).values({
      memberId,
      gymId,
      homeBranch: input.branchId ?? null,
      fullname: input.fullname,
      phone: input.phone,
      gender: input.gender ?? null,
      joinedAt: now,
      birthdate: input.birthdate ?? null,
      uniqueId: await nextMemberCode(tx, gymId),
      type: null,
      status: "active",
    });

    if (input.membership) {
      /*
       * Selling a membership writes an income row, whose `created_by` is NOT
       * NULL. Saying plainly that the caller was not identified beats letting
       * MySQL reject the insert with a column name no operator can act on.
       * Throwing here rolls the member insert back with it.
       */
      if (!workerId) {
        throw new UnauthorizedError("Missing x-worker-id");
      }

      await sellMembership(tx, { gymId, input, memberId, now, workerId });
    }
  });

  const [created] = (await listMembers(gymId)).filter(
    (member) => member.id === memberId
  );

  if (!created) {
    throw new NotFoundError("Member not found");
  }

  return created;
};

export const updateMember = async (
  gymId: string,
  memberId: string,
  input: UpdateMemberInput
): Promise<void> => {
  // affectedRows counts *changed* rows, so a no-op save would look like a 404.
  await assertMemberExists(gymId, memberId);

  await db
    .update(members)
    .set({
      fullname: input.fullname,
      phone: input.phone,
      gender: input.gender ?? null,
      birthdate: input.birthdate ?? null,
      homeBranch: input.branchId ?? null,
    })
    .where(and(eq(members.gymId, gymId), eq(members.memberId, memberId)));
};

/**
 * Deletes a member outright, face and all.
 *
 * The line drawn here is between what only describes the member and what the
 * gym's books are made of. Memberships and attendance describe them: without
 * the member they mean nothing, and left behind they surface as blank rows in
 * the visits table — there are no foreign keys in this database, so nothing
 * else would stop that. Payments are different. `income` is the ledger; a row
 * removed from it changes what the gym earned. So a member who has ever paid
 * for anything cannot be deleted, only deactivated, and the refusal says so.
 *
 * The face goes first and strictly. `purgeFaceEverywhere` throws if a terminal
 * is unreachable, and that failure has to abandon the whole delete: a face left
 * on a box after its owner is gone still opens the door, and the CRM can no
 * longer say for whom.
 */
export const deleteMember = async (
  gymId: string,
  memberId: string
): Promise<void> => {
  await assertMemberExists(gymId, memberId);

  const [paid] = await db
    .select({ transactionId: income.transactionId })
    .from(income)
    .where(and(eq(income.gymId, gymId), eq(income.memberId, memberId)))
    .limit(1);

  if (paid) {
    throw new ConflictError(
      "This member has payments on record. Deactivate them instead."
    );
  }

  const [ordered] = await db
    .select({ orderId: orders.orderId })
    .from(orders)
    .where(
      and(
        eq(orders.gymId, gymId),
        eq(orders.userId, memberId),
        eq(orders.userType, "member")
      )
    )
    .limit(1);

  if (ordered) {
    throw new ConflictError(
      "This member has shop orders on record. Deactivate them instead."
    );
  }

  await purgeFaceEverywhere(gymId, memberId);

  await db.transaction(async (tx) => {
    await tx
      .delete(attendanceEvents)
      .where(
        and(
          eq(attendanceEvents.gymId, gymId),
          eq(attendanceEvents.personType, "member"),
          eq(attendanceEvents.personId, memberId)
        )
      );

    await tx
      .delete(attendanceSessions)
      .where(
        and(
          eq(attendanceSessions.gymId, gymId),
          eq(attendanceSessions.personType, "member"),
          eq(attendanceSessions.personId, memberId)
        )
      );

    await tx
      .delete(memberships)
      .where(
        and(eq(memberships.gymId, gymId), eq(memberships.memberId, memberId))
      );

    await tx
      .delete(members)
      .where(and(eq(members.gymId, gymId), eq(members.memberId, memberId)));
  });
};

export const setMemberActive = async (
  gymId: string,
  memberId: string,
  isActive: boolean
): Promise<void> => {
  await assertMemberExists(gymId, memberId);

  await db
    .update(members)
    .set({ status: isActive ? "active" : "inactive" })
    .where(and(eq(members.gymId, gymId), eq(members.memberId, memberId)));
};
