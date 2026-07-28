import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  like,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { db } from "../db/index.js";
import {
  attendanceEvents,
  attendanceSessions,
  credentials,
  devices,
  members,
  memberships,
  plans,
  workers,
} from "../db/schema.js";
import { ConflictError, NotFoundError } from "../lib/errors.js";
import type { TerminalEvent } from "../lib/hikvision.js";

/**
 * Turning a scan into attendance.
 *
 * The manual "Kelish" button in worker.service and a face at the terminal must
 * land in exactly the same place — one `attendance_events` row and one
 * `attendance_sessions` row that opens and later closes. Two code paths writing
 * "the same" shift in two slightly different ways is how a payroll figure ends
 * up depending on which door somebody used, so the roll-up lives here and both
 * callers go through it.
 */

export type PersonType = "member" | "worker";

export type Direction = "in" | "out";

/** The handle a `db.transaction` callback is given, so helpers can take one. */
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface AttendanceMark {
  branchId: string | null;
  credentialId?: string | null;
  deviceId?: string | null;
  gymId: string;
  personId: string;
  personType: PersonType;
  /** `manual` when a human clicked, `face`/`card` when a terminal reported it. */
  source: string;
  time: Date;
}

const toIsoDate = (value: Date | string | null): string | null => {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const toDateString = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;

const minutesBetween = (from: Date, to: Date): number =>
  Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000));

/** The open session for a person, or null when they are not checked in. */
export const openSessionOf = async (
  gymId: string,
  personType: PersonType,
  personId: string
) => {
  const [session] = await db
    .select()
    .from(attendanceSessions)
    .where(
      and(
        eq(attendanceSessions.gymId, gymId),
        eq(attendanceSessions.personType, personType),
        eq(attendanceSessions.personId, personId),
        isNull(attendanceSessions.checkOut)
      )
    )
    .orderBy(desc(attendanceSessions.checkIn))
    .limit(1);

  return session ?? null;
};

const insertEvent = (
  tx: Transaction,
  mark: AttendanceMark,
  direction: Direction
) =>
  tx.insert(attendanceEvents).values({
    branchId: mark.branchId,
    createdAt: new Date(),
    credentialId: mark.credentialId ?? null,
    deviceId: mark.deviceId ?? null,
    direction,
    eventTime: mark.time,
    gymId: mark.gymId,
    personId: mark.personId,
    personType: mark.personType,
    source: mark.source,
  });

/** Opens a shift and records the event that opened it. */
export const recordCheckIn = async (
  tx: Transaction,
  mark: AttendanceMark
): Promise<void> => {
  await tx.insert(attendanceSessions).values({
    branchId: mark.branchId,
    checkIn: mark.time,
    checkOut: null,
    createdAt: new Date(),
    gymId: mark.gymId,
    isCorrected: false,
    minutesWorked: null,
    needsReview: false,
    personId: mark.personId,
    personType: mark.personType,
    status: "open",
    // Attendance has no operator column; a mark records no actor either way.
    correctedBy: null,
    workDate: toDateString(mark.time),
  });

  await insertEvent(tx, mark, "in");
};

/** Closes the given shift and records the event that closed it. */
export const recordCheckOut = async (
  tx: Transaction,
  mark: AttendanceMark,
  session: { checkIn: Date | null; sessionId: number }
): Promise<void> => {
  await tx
    .update(attendanceSessions)
    .set({
      checkOut: mark.time,
      minutesWorked: session.checkIn
        ? minutesBetween(session.checkIn, mark.time)
        : 0,
      status: "closed",
    })
    .where(eq(attendanceSessions.sessionId, session.sessionId));

  await insertEvent(tx, mark, "out");
};

/** Who a terminal credential belongs to. */
interface CredentialOwner {
  branchId: string | null;
  credentialId: string;
  name: string;
  personId: string;
  personType: PersonType;
}

/**
 * Resolves the `employeeNo` a terminal reported to a person. Only active
 * credentials count — revoking one is how a sacked member of staff stops being
 * able to clock in, and it must take effect without touching the device.
 */
export const resolveCredential = async (
  gymId: string,
  employeeNo: string
): Promise<CredentialOwner | null> => {
  const [row] = await db
    .select({
      credentialId: credentials.credentialId,
      ownerId: credentials.ownerId,
      ownerType: credentials.ownerType,
    })
    .from(credentials)
    .where(
      and(
        eq(credentials.gymId, gymId),
        eq(credentials.credentialValue, employeeNo),
        eq(credentials.isActive, true)
      )
    )
    .limit(1);

  if (!(row?.ownerId && row.ownerType)) {
    return null;
  }

  const personType: PersonType =
    row.ownerType === "member" ? "member" : "worker";

  if (personType === "worker") {
    const [worker] = await db
      .select({ branchId: workers.branchId, name: workers.fullname })
      .from(workers)
      .where(and(eq(workers.gymId, gymId), eq(workers.workerId, row.ownerId)))
      .limit(1);

    if (!worker) {
      return null;
    }

    return {
      branchId: worker.branchId,
      credentialId: row.credentialId,
      name: worker.name ?? "",
      personId: row.ownerId,
      personType,
    };
  }

  const [member] = await db
    // A member's branch column is `home_branch`, not `branch_id`.
    .select({ branchId: members.homeBranch, name: members.fullname })
    .from(members)
    .where(and(eq(members.gymId, gymId), eq(members.memberId, row.ownerId)))
    .limit(1);

  if (!member) {
    return null;
  }

  return {
    branchId: member.branchId,
    credentialId: row.credentialId,
    name: member.name ?? "",
    personId: row.ownerId,
    personType,
  };
};

/**
 * Two scans of the same face a few seconds apart are one arrival, not two — a
 * MinMoe will happily read somebody twice while they pull the door open. Only
 * the first inside this window counts.
 */
const DEBOUNCE_MS = 60_000;

const hasRecentEvent = async (
  gymId: string,
  personType: PersonType,
  personId: string,
  at: Date
): Promise<boolean> => {
  const [row] = await db
    .select({ eventTime: attendanceEvents.eventTime })
    .from(attendanceEvents)
    .where(
      and(
        eq(attendanceEvents.gymId, gymId),
        eq(attendanceEvents.personType, personType),
        eq(attendanceEvents.personId, personId)
      )
    )
    .orderBy(desc(attendanceEvents.eventTime))
    .limit(1);

  if (!row?.eventTime) {
    return false;
  }

  const previous = new Date(row.eventTime).getTime();

  return Math.abs(at.getTime() - previous) < DEBOUNCE_MS;
};

/**
 * Why a member was stopped at the door. Recomputed at read time from the scan's
 * own timestamp rather than stored, so it is always a pure function of facts
 * that are already in the database — there is no reason column to keep in step
 * and no way for it to drift from the plan it describes.
 */
export const DENIAL_REASONS = [
  "outside_hours",
  "wrong_weekday",
  "no_visits",
  "expired",
  "no_membership",
] as const;

export type DenialReason = (typeof DENIAL_REASONS)[number];

export interface AccessDecision {
  /** The plan's window, for the message. Null when it has no window. */
  accessFrom: string | null;
  accessTo: string | null;
  isAllowed: boolean;
  /** The membership to count the visit against, once allowed. */
  membershipId: string | null;
  planName: string | null;
  reason: DenialReason | null;
}

const minutesOfDay = (date: Date): number =>
  date.getHours() * 60 + date.getMinutes();

/** `Date` uses 0 for Sunday; the plans store ISO numbers, where Sunday is 7. */
const isoWeekday = (date: Date): number => date.getDay() || 7;

const toTimeString = (value: Date | string | null): string | null => {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
};

/** How badly a denial should be reported when several memberships disagree. */
const REASON_RANK: Record<DenialReason, number> = {
  expired: 3,
  no_membership: 4,
  no_visits: 2,
  outside_hours: 0,
  wrong_weekday: 1,
};

/** One membership row, as the access query returns it. */
interface MembershipRow {
  accessFrom: Date | string | null;
  accessTo: Date | string | null;
  endsAt: Date | string | null;
  membershipId: string;
  planName: string | null;
  remainingVisits: number | null;
  startsAt: Date | string | null;
  weekdays: string | null;
}

/** Whether a plan's daily window is open, given minutes since local midnight. */
const isWindowOpen = (from: string, to: string, minutes: number): boolean => {
  const [fromHour = 0, fromMinute = 0] = from.split(":").map(Number);
  const [toHour = 0, toMinute = 0] = to.split(":").map(Number);
  const opens = fromHour * 60 + fromMinute;
  const closes = toHour * 60 + toMinute;

  // A window that ends before it starts runs over midnight (22:00–06:00), which
  // is one continuous night rather than an empty range.
  return opens <= closes
    ? minutes >= opens && minutes <= closes
    : minutes >= opens || minutes <= closes;
};

/** Does this one membership open the door right now — and if not, why not. */
const judgeMembership = (
  row: MembershipRow,
  at: Date,
  minutes: number,
  weekday: number
): AccessDecision => {
  const from = toTimeString(row.accessFrom);
  const to = toTimeString(row.accessTo);
  const base = {
    accessFrom: from,
    accessTo: to,
    membershipId: row.membershipId,
    planName: row.planName ?? null,
  };

  const startsAt = row.startsAt ? new Date(row.startsAt) : null;
  const endsAt = row.endsAt ? new Date(row.endsAt) : null;

  if ((startsAt && at < startsAt) || (endsAt && at > endsAt)) {
    return { ...base, isAllowed: false, reason: "expired" };
  }

  if (row.remainingVisits !== null && row.remainingVisits <= 0) {
    return { ...base, isAllowed: false, reason: "no_visits" };
  }

  const allowedDays = (row.weekdays ?? "")
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7);

  if (allowedDays.length > 0 && !allowedDays.includes(weekday)) {
    return { ...base, isAllowed: false, reason: "wrong_weekday" };
  }

  if (from && to && !isWindowOpen(from, to, minutes)) {
    return { ...base, isAllowed: false, reason: "outside_hours" };
  }

  return { ...base, isAllowed: true, reason: null };
};

/**
 * Whether this member may come in at this moment, and if not, why.
 *
 * A member can hold several memberships at once, so the answer is "yes" if *any*
 * of them opens the door — and when none do, the reason reported is the most
 * actionable one. "Outside hours" outranks "expired" deliberately: it is the
 * case a human at the desk can wave through, which is the whole point of the
 * decision queue.
 *
 * Two absences mean "no restriction", not "no access": a plan with no
 * `accessFrom`/`accessTo` runs all day, and one with no weekdays runs every day.
 * Both fields default to empty when a plan is created without touching them, so
 * reading them as a closed door would lock out every gym that never configured
 * one.
 */
export const evaluateMemberAccess = async (
  gymId: string,
  memberId: string,
  at: Date
): Promise<AccessDecision> => {
  const rows = await db
    .select({
      accessFrom: plans.startsAt,
      accessTo: plans.endsAt,
      endsAt: memberships.endsAt,
      membershipId: memberships.membershipId,
      planName: plans.plan,
      remainingVisits: memberships.remainingVisits,
      startsAt: memberships.startsAt,
      status: memberships.status,
      weekdays: plans.weekdays,
    })
    .from(memberships)
    .leftJoin(plans, eq(plans.planId, memberships.planId))
    .where(
      and(
        eq(memberships.gymId, gymId),
        eq(memberships.memberId, memberId),
        ne(memberships.status, "cancelled")
      )
    );

  if (rows.length === 0) {
    return {
      accessFrom: null,
      accessTo: null,
      isAllowed: false,
      membershipId: null,
      planName: null,
      reason: "no_membership",
    };
  }

  const minutes = minutesOfDay(at);
  const weekday = isoWeekday(at);

  let denial: AccessDecision | null = null;

  const worse = (candidate: AccessDecision): void => {
    if (
      !denial ||
      REASON_RANK[candidate.reason ?? "no_membership"] <
        REASON_RANK[denial.reason ?? "no_membership"]
    ) {
      denial = candidate;
    }
  };

  for (const row of rows) {
    const decision = judgeMembership(row, at, minutes, weekday);

    if (decision.isAllowed) {
      return decision;
    }

    worse(decision);
  }

  return (
    denial ?? {
      accessFrom: null,
      accessTo: null,
      isAllowed: false,
      membershipId: null,
      planName: null,
      reason: "no_membership",
    }
  );
};

/** A visit-billed membership counts down; a duration one is left alone. */
const countVisit = async (
  tx: Transaction,
  membershipId: string | null,
  at: Date
): Promise<void> => {
  if (!membershipId) {
    return;
  }

  await tx
    .update(memberships)
    .set({
      lastVisit: at,
      // Floored at zero: an accepted entry on an exhausted pass is a decision
      // somebody made, not a reason to book a negative balance.
      remainingVisits: sql`GREATEST(COALESCE(${memberships.remainingVisits}, 0) - 1, 0)`,
    })
    .where(
      and(
        eq(memberships.membershipId, membershipId),
        // Only a plan that counts visits has a number here to decrement.
        isNotNull(memberships.remainingVisits)
      )
    );
};

/**
 * A scan the terminal was happy with and the CRM was not: the device matched a
 * face, reported an id, and no active credential in this gym owns it. Almost
 * always somebody who was deleted here while the terminal kept their face.
 *
 * Nothing is written for it — there is no person to attach a session to — so
 * without this the desk sees a door that opened for nobody and a screen that
 * never moved. Held in memory, like the armed captures in device.service: the
 * notice lives for minutes, one server owns it, and losing it to a restart
 * costs the operator a second scan.
 */
export interface UnknownScan {
  at: string;
  deviceId: string;
  deviceName: string | null;
  /** The id the terminal reported, already decoded to our own id space. */
  employeeNo: string;
}

/**
 * The other scan that writes nothing: the same person again, inside the
 * debounce. Dropping it is right — one arrival is one arrival — but dropping it
 * without a word leaves the desk watching a door that beeped and a screen that
 * did not move, which reads as a broken terminal rather than a working one.
 */
export interface DuplicateScan {
  at: string;
  deviceName: string | null;
  name: string;
  /**
   * `debounce` — read twice while they pulled the door open, seconds apart.
   * `inside` — they are already counted in today. Members here never scan out,
   * so every scan after the first is this one.
   */
  reason: "debounce" | "inside";
}

/** Long enough for the desk to look up, short enough to stay "just now". */
const UNKNOWN_SCAN_TTL_MS = 10 * 60_000;

/**
 * Long enough that the desk looking up a moment later still sees why the screen
 * did not move, short enough that it is unmistakably about the scan just made.
 */
const DUPLICATE_SCAN_TTL_MS = 2 * 60_000;

const unknownScans = new Map<string, UnknownScan>();
const duplicateScans = new Map<string, DuplicateScan>();

/**
 * The notice still worth showing, or null.
 *
 * Age is measured from the scan itself rather than from when it was stored, so
 * pulling a terminal's buffered history cannot raise a banner about something
 * that happened last night.
 */
const readFresh = <T extends { at: string }>(
  store: Map<string, T>,
  gymId: string,
  ttlMs: number
): T | null => {
  const notice = store.get(gymId);

  if (!notice) {
    return null;
  }

  const at = new Date(notice.at).getTime();

  if (!Number.isFinite(at) || Date.now() - at > ttlMs) {
    store.delete(gymId);

    return null;
  }

  return notice;
};

export const readUnknownScan = (gymId: string): UnknownScan | null =>
  readFresh(unknownScans, gymId, UNKNOWN_SCAN_TTL_MS);

export const clearUnknownScan = (gymId: string): void => {
  unknownScans.delete(gymId);
};

export type IngestOutcome =
  | { direction: Direction; name: string; status: "recorded" }
  /** A member who is already counted in for today. Nothing was written. */
  | { name: string; status: "inside" }
  | { reason: "duplicate" | "unknown_credential"; status: "ignored" }
  | {
      name: string;
      /** Why the door said no; the desk may still wave them through. */
      reason: DenialReason;
      sessionId: number;
      status: "pending";
    };

/** A session parked for a human decision, rather than counted as a visit. */
const PENDING_STATUS = "pending";
const REJECTED_STATUS = "rejected";

/**
 * The member's session for the day this scan happened on, whatever state it is
 * in — bar a refusal the desk already turned away, which should not stop them
 * being let in on a second try.
 *
 * This, rather than "is a session open", is what decides whether a scan is an
 * arrival. Members here never scan out, so their session stays open until the
 * day rolls over; asking whether one is open would make every scan after the
 * first look like a departure.
 */
const memberSessionToday = async (
  gymId: string,
  memberId: string,
  at: Date
) => {
  const [session] = await db
    .select({
      sessionId: attendanceSessions.sessionId,
      status: attendanceSessions.status,
    })
    .from(attendanceSessions)
    .where(
      and(
        eq(attendanceSessions.gymId, gymId),
        eq(attendanceSessions.personType, "member"),
        eq(attendanceSessions.personId, memberId),
        eq(attendanceSessions.workDate, toDateString(at)),
        ne(attendanceSessions.status, REJECTED_STATUS)
      )
    )
    .orderBy(desc(attendanceSessions.checkIn))
    .limit(1);

  return session ?? null;
};

/**
 * Closes a visit left open when the gym shut, so it cannot follow the member
 * into the next day.
 *
 * The check-out is the check-in: nobody watched them leave and inventing a
 * departure time would be a number the desk could not question. `needs_review`
 * is what says so out loud.
 */
const closeStaleSession = (session: {
  checkIn: Date | null;
  sessionId: number;
}) =>
  db
    .update(attendanceSessions)
    .set({
      checkOut: session.checkIn,
      minutesWorked: 0,
      needsReview: true,
      status: "closed",
    })
    .where(eq(attendanceSessions.sessionId, session.sessionId));

/** The statuses that mean "this was a real visit" — what the table counts. */
const VISIT_STATUSES = ["open", "closed"];

const touchDevice = (gymId: string, deviceId: string) =>
  db
    .update(devices)
    .set({ lastSeen: new Date() })
    .where(and(eq(devices.gymId, gymId), eq(devices.deviceId, deviceId)));

/**
 * Records the scan and the session it would have opened, but marked `pending`
 * so nothing counts it yet.
 *
 * The event is written either way: somebody stood at that door and the terminal
 * recognised them, and that happened whether or not the desk lets them in. What
 * the decision changes is whether it becomes a visit.
 */
const parkForDecision = async (mark: AttendanceMark): Promise<number> => {
  const inserted = await db.transaction(async (tx) => {
    const [result] = await tx.insert(attendanceSessions).values({
      branchId: mark.branchId,
      checkIn: mark.time,
      checkOut: null,
      correctedBy: null,
      createdAt: new Date(),
      gymId: mark.gymId,
      isCorrected: false,
      minutesWorked: null,
      needsReview: true,
      personId: mark.personId,
      personType: mark.personType,
      status: PENDING_STATUS,
      workDate: toDateString(mark.time),
    });

    await insertEvent(tx, mark, "in");

    return result;
  });

  return Number(inserted.insertId);
};

/**
 * The last-resort reading of a scan, when neither the reader nor the device
 * said which way somebody was going.
 *
 * It is not applied to members at all. They do not scan out here: they come in,
 * train, and walk past the terminal on the way out without looking at it.
 * Reading their second scan as a departure is how a visit turns into a
 * check-out nobody asked for. Only a reader that is explicitly an exit, or a
 * device reporting its own check-out status, takes a member back out.
 */
const toggledDirection = (
  personType: PersonType,
  openSession: unknown
): Direction => {
  if (personType === "member") {
    return "in";
  }

  return openSession ? "out" : "in";
};

/**
 * A member at the door on the way in: already here today, refused, or admitted.
 *
 * Split out of `ingestTerminalEvent` because it is the only branch with real
 * rules in it — everything around it is deciding whose scan this is and which
 * way they were walking.
 */
const admitMember = async ({
  deviceName,
  event,
  gymId,
  mark,
  openSession,
  owner,
}: {
  deviceName: string | null;
  event: TerminalEvent;
  gymId: string;
  mark: AttendanceMark;
  openSession: { checkIn: Date | null; sessionId: number } | null;
  owner: CredentialOwner;
}): Promise<IngestOutcome> => {
  const today = await memberSessionToday(
    gymId,
    owner.personId,
    event.eventTime
  );

  /*
   * Already dealt with today, one way or the other. Nothing is written: a
   * second visit would count their pass down twice for one day, and a second
   * pending row would put the same person in the queue twice while they stand
   * at the door waiting for the first answer.
   */
  if (today) {
    if (today.status === PENDING_STATUS) {
      const waiting = await evaluateMemberAccess(
        gymId,
        owner.personId,
        event.eventTime
      );

      return {
        name: owner.name,
        reason: waiting.reason ?? "no_membership",
        sessionId: today.sessionId,
        status: "pending",
      };
    }

    duplicateScans.set(gymId, {
      at: event.eventTime.toISOString(),
      deviceName,
      name: owner.name,
      reason: "inside",
    });

    return { name: owner.name, status: "inside" };
  }

  // Yesterday's visit, still open because they never scanned out. Closing it
  // here keeps one open session per member, so the "inside now" count means
  // today rather than everyone who has ever come.
  if (openSession) {
    await closeStaleSession(openSession);
  }

  const decision = await evaluateMemberAccess(
    gymId,
    owner.personId,
    event.eventTime
  );

  if (!decision.isAllowed) {
    return {
      name: owner.name,
      reason: decision.reason ?? "no_membership",
      sessionId: await parkForDecision(mark),
      status: "pending",
    };
  }

  await db.transaction(async (tx) => {
    await recordCheckIn(tx, mark);
    await countVisit(tx, decision.membershipId, event.eventTime);
  });

  return { direction: "in", name: owner.name, status: "recorded" };
};

/**
 * One scan from a terminal, all the way to a session.
 *
 * Direction is decided in the order the information deserves to be trusted:
 * what the device was told it is (an exit reader is an exit reader), then what
 * the device itself reported (`attendanceStatus`, when the terminal is running
 * in attendance mode), and only then the toggle — no open shift means arriving,
 * an open shift means leaving. The toggle is last because it is the one that
 * silently does the wrong thing if anything upstream was missed.
 */
export const ingestTerminalEvent = async (
  gymId: string,
  device: {
    branchId: string | null;
    deviceId: string;
    deviceName?: string | null;
    direction: string | null;
  },
  event: TerminalEvent
): Promise<IngestOutcome> => {
  if (!event.employeeNo) {
    // A stranger, or a failed match. The device reports these too; they are not
    // attendance and must not become a session. Nor are they worth a banner:
    // the terminal refused them, and there is no id to act on.
    return { reason: "unknown_credential", status: "ignored" };
  }

  const owner = await resolveCredential(gymId, event.employeeNo);

  if (!owner) {
    // The device let somebody through that this gym cannot name. Remembered so
    // the desk can see it and take the stale face off the terminal.
    unknownScans.set(gymId, {
      at: event.eventTime.toISOString(),
      deviceId: device.deviceId,
      deviceName: device.deviceName ?? null,
      employeeNo: event.employeeNo,
    });

    await touchDevice(gymId, device.deviceId);

    return { reason: "unknown_credential", status: "ignored" };
  }

  if (
    await hasRecentEvent(
      gymId,
      owner.personType,
      owner.personId,
      event.eventTime
    )
  ) {
    duplicateScans.set(gymId, {
      at: event.eventTime.toISOString(),
      deviceName: device.deviceName ?? null,
      name: owner.name,
      reason: "debounce",
    });

    await touchDevice(gymId, device.deviceId);

    return { reason: "duplicate", status: "ignored" };
  }

  const session = await openSessionOf(gymId, owner.personType, owner.personId);

  const fromDevice =
    device.direction === "in" || device.direction === "out"
      ? (device.direction as Direction)
      : null;

  const fromEvent = (() => {
    const status = event.attendanceStatus?.toLowerCase() ?? "";

    if (status.includes("checkin") || status.includes("breakout")) {
      return "in" as const;
    }

    return status.includes("checkout") || status.includes("breakin")
      ? ("out" as const)
      : null;
  })();

  const direction: Direction =
    fromDevice ?? fromEvent ?? toggledDirection(owner.personType, session);

  const mark: AttendanceMark = {
    branchId: owner.branchId ?? device.branchId,
    credentialId: owner.credentialId,
    deviceId: device.deviceId,
    gymId,
    personId: owner.personId,
    personType: owner.personType,
    source: "face",
    time: event.eventTime,
  };

  // A member arriving has to be entitled to; a member of staff clocking on does
  // not. The check runs only on the way in — nobody is ever stopped from leaving.
  if (owner.personType === "member" && direction === "in") {
    const outcome = await admitMember({
      deviceName: device.deviceName ?? null,
      event,
      gymId,
      mark,
      openSession: session,
      owner,
    });

    await touchDevice(gymId, device.deviceId);

    return outcome;
  }

  await db.transaction(async (tx) => {
    if (direction === "out" && session) {
      await recordCheckOut(tx, mark, session);
      return;
    }

    // An "out" with nothing open, or an "in" while a shift is already running:
    // record the event honestly and let the desk sort it out rather than
    // inventing a session or dropping the scan.
    if (direction === "out") {
      await insertEvent(tx, mark, "out");
      return;
    }

    if (session) {
      await insertEvent(tx, mark, "in");
      await tx
        .update(attendanceSessions)
        .set({ needsReview: true })
        .where(eq(attendanceSessions.sessionId, session.sessionId));
      return;
    }

    await recordCheckIn(tx, mark);
  });

  await touchDevice(gymId, device.deviceId);

  return { direction, name: owner.name, status: "recorded" };
};

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

/** The recent scans, newest first — what the terminals screen shows live. */
export const listRecentEvents = async (
  gymId: string,
  limit = 50
): Promise<AttendanceEventView[]> => {
  const rows = await db
    .select({
      deviceName: devices.deviceName,
      direction: attendanceEvents.direction,
      id: attendanceEvents.eventId,
      memberName: members.fullname,
      personId: attendanceEvents.personId,
      personType: attendanceEvents.personType,
      source: attendanceEvents.source,
      time: attendanceEvents.eventTime,
      workerName: workers.fullname,
    })
    .from(attendanceEvents)
    .leftJoin(devices, eq(devices.deviceId, attendanceEvents.deviceId))
    .leftJoin(
      workers,
      and(
        eq(workers.workerId, attendanceEvents.personId),
        eq(attendanceEvents.personType, "worker")
      )
    )
    .leftJoin(
      members,
      and(
        eq(members.memberId, attendanceEvents.personId),
        eq(attendanceEvents.personType, "member")
      )
    )
    .where(eq(attendanceEvents.gymId, gymId))
    .orderBy(desc(attendanceEvents.eventTime))
    .limit(limit);

  return rows.map((row) => ({
    deviceName: row.deviceName,
    direction: row.direction,
    id: row.id,
    personId: row.personId,
    personName: row.workerName ?? row.memberName,
    personType: row.personType,
    source: row.source,
    time: row.time ? new Date(row.time).toISOString() : null,
  }));
};

export interface PendingDecision {
  /** The plan's window, so the desk can see what they missed by how much. */
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
 * Everyone waiting on a decision, oldest first — somebody is standing at the
 * door, so the queue is answered in the order people arrived.
 *
 * The reason is recomputed per row from the scan's own timestamp. It is cheap
 * (the queue is people currently at a door, not a report) and it means the
 * message can never contradict the plan it is quoting.
 */
export const listPendingDecisions = async (
  gymId: string
): Promise<PendingDecision[]> => {
  const rows = await db
    .select({
      at: attendanceSessions.checkIn,
      memberId: attendanceSessions.personId,
      name: members.fullname,
      phone: members.phone,
      sessionId: attendanceSessions.sessionId,
    })
    .from(attendanceSessions)
    .leftJoin(members, eq(members.memberId, attendanceSessions.personId))
    .where(
      and(
        eq(attendanceSessions.gymId, gymId),
        eq(attendanceSessions.status, PENDING_STATUS)
      )
    )
    .orderBy(asc(attendanceSessions.checkIn));

  const decisions: PendingDecision[] = [];

  for (const row of rows) {
    if (!row.memberId) {
      continue;
    }

    const at = row.at ? new Date(row.at) : new Date();
    const decision = await evaluateMemberAccess(gymId, row.memberId, at);

    decisions.push({
      accessFrom: decision.accessFrom,
      accessTo: decision.accessTo,
      at: toIsoDate(row.at),
      memberId: row.memberId,
      name: row.name ?? "",
      phone: row.phone,
      planName: decision.planName,
      reason: decision.reason ?? "no_membership",
      sessionId: row.sessionId,
    });
  }

  return decisions;
};

export interface DoorState {
  /** The same person again, inside the debounce — a scan that changed nothing. */
  duplicateScan: DuplicateScan | null;
  /** The newest scan any terminal reported, whoever it was. */
  latestEvent: AttendanceEventView | null;
  pending: PendingDecision[];
  unknownScan: UnknownScan | null;
}

/**
 * Everything the attendance screen's banner needs, in one read.
 *
 * It is one call rather than three because it is polled every few seconds while
 * somebody stands at a door, and because the three answers describe the same
 * moment — fetched separately they could disagree, showing a refusal that the
 * queue underneath has already lost.
 */
export const readDoorState = async (gymId: string): Promise<DoorState> => {
  const [events, pending] = await Promise.all([
    listRecentEvents(gymId, 1),
    listPendingDecisions(gymId),
  ]);

  return {
    duplicateScan: readFresh(duplicateScans, gymId, DUPLICATE_SCAN_TTL_MS),
    latestEvent: events[0] ?? null,
    pending,
    unknownScan: readUnknownScan(gymId),
  };
};

/**
 * The desk's answer. Accepting turns the parked session into a real visit —
 * "Baribir qabul qilish", let them in anyway — and counts it down against the
 * membership exactly as an allowed scan would. Rejecting closes it as refused.
 *
 * Either way `is_corrected` and `corrected_by` record that a human decided,
 * which is what separates a waved-through entry from one the plan permitted.
 */
export const decidePending = async (
  gymId: string,
  sessionId: number,
  isAccepted: boolean,
  workerId: string | null
): Promise<void> => {
  const [session] = await db
    .select()
    .from(attendanceSessions)
    .where(
      and(
        eq(attendanceSessions.gymId, gymId),
        eq(attendanceSessions.sessionId, sessionId)
      )
    )
    .limit(1);

  if (!session) {
    throw new NotFoundError("Entry not found");
  }

  if (session.status !== PENDING_STATUS) {
    throw new ConflictError("This entry has already been decided");
  }

  const at = session.checkIn ? new Date(session.checkIn) : new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(attendanceSessions)
      .set({
        // A refusal is closed on the spot: nobody is inside, so it must never
        // sit in the "still here" count.
        checkOut: isAccepted ? null : at,
        correctedBy: workerId,
        isCorrected: true,
        needsReview: false,
        status: isAccepted ? "open" : REJECTED_STATUS,
      })
      .where(eq(attendanceSessions.sessionId, sessionId));

    if (isAccepted && session.personId) {
      const decision = await evaluateMemberAccess(gymId, session.personId, at);

      await countVisit(tx, decision.membershipId, at);
    }
  });
};

export interface AttendanceRow {
  /** Their most recent visit inside the range — the row is the member, not one entry. */
  at: string | null;
  memberId: string;
  name: string;
  phone: string | null;
  /**
   * Sessions this member has left **as of now**, not as of any visit on this
   * row: the number worth acting on is the one that decides whether they need
   * to renew, and nothing records what the counter read three weeks ago.
   */
  remainingVisits: number | null;
  /** The member's own code (`A06`) — what the desk calls them by. */
  uniqueId: string | null;
  /** How many times they came inside the filtered range. */
  visits: number;
}

export interface AttendancePage {
  rows: AttendanceRow[];
  /** Members who came in the range — what the pager counts. */
  total: number;
  /** Visits in the range across all of them — the header figure. */
  visits: number;
}

export interface AttendanceQuery {
  from: Date;
  page: number;
  pageSize: number;
  query: string | null;
  to: Date;
}

/**
 * The visits table. One row per entry, with that member's total across the whole
 * range beside it — the question "how often does this person come?" is the one
 * the list is really for, and it should not need a second screen.
 */
export const listAttendance = async (
  gymId: string,
  query: AttendanceQuery
): Promise<AttendancePage> => {
  const needle = query.query?.trim() ?? "";

  const scope = and(
    eq(attendanceSessions.gymId, gymId),
    eq(attendanceSessions.personType, "member"),
    inArray(attendanceSessions.status, VISIT_STATUSES),
    gte(attendanceSessions.checkIn, query.from),
    lte(attendanceSessions.checkIn, query.to),
    needle === ""
      ? undefined
      : or(
          like(members.fullname, `%${needle}%`),
          like(members.phone, `%${needle}%`),
          // The code is a column on this list now, so it has to be findable —
          // a column you can read but not search is a dead end.
          like(members.uniqueId, `%${needle}%`)
        )
  );

  const [counted] = await db
    .select({
      total: sql<string>`COUNT(DISTINCT ${attendanceSessions.personId})`,
      visits: sql<string>`COUNT(*)`,
    })
    .from(attendanceSessions)
    .leftJoin(members, eq(members.memberId, attendanceSessions.personId))
    .where(scope);

  /*
   * Grouped by member, so somebody who came eleven times is one row reading
   * "11" rather than eleven rows reading "11" beside each other. The date shown
   * is their most recent visit in the range: the older ones are what the count
   * is made of, and a list sorted by "who was here last" is the one the desk
   * reads down.
   *
   * The member columns are named in the GROUP BY rather than left to MySQL —
   * they are functionally dependent on the id, but only a server without
   * ONLY_FULL_GROUP_BY would take that on trust.
   */
  const rows = await db
    .select({
      at: sql<Date | string | null>`MAX(${attendanceSessions.checkIn})`,
      memberId: attendanceSessions.personId,
      name: members.fullname,
      phone: members.phone,
      uniqueId: members.uniqueId,
      visits: sql<string>`COUNT(*)`,
    })
    .from(attendanceSessions)
    .leftJoin(members, eq(members.memberId, attendanceSessions.personId))
    .where(scope)
    .groupBy(
      attendanceSessions.personId,
      members.fullname,
      members.phone,
      members.uniqueId
    )
    .orderBy(desc(sql`MAX(${attendanceSessions.checkIn})`))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);

  const memberIds = [
    ...new Set(
      rows.map((row) => row.memberId).filter((id): id is string => Boolean(id))
    ),
  ];

  // Summed across all of the member's memberships, which is exactly how
  // listMembers builds its own "qolgan sessiyalar" — the two screens showing
  // different numbers for the same thing would be worse than either definition
  // being arguable.
  const remainingRows =
    memberIds.length === 0
      ? []
      : await db
          .select({
            memberId: memberships.memberId,
            remaining: sql<string | null>`SUM(${memberships.remainingVisits})`,
          })
          .from(memberships)
          .where(
            and(
              eq(memberships.gymId, gymId),
              inArray(memberships.memberId, memberIds)
            )
          )
          .groupBy(memberships.memberId);

  const remainingByMember = new Map<string, number>();

  for (const row of remainingRows) {
    // SUM over a column that is null everywhere is null, not zero — a member on
    // a time-based plan has no session counter at all, which is not "0 left".
    if (row.memberId && row.remaining !== null) {
      remainingByMember.set(row.memberId, Number(row.remaining));
    }
  }

  return {
    rows: rows.map((row) => ({
      at: toIsoDate(row.at),
      memberId: row.memberId ?? "",
      name: row.name ?? "",
      phone: row.phone,
      remainingVisits: remainingByMember.get(row.memberId ?? "") ?? null,
      uniqueId: row.uniqueId,
      visits: Number(row.visits),
    })),
    total: Number(counted?.total ?? 0),
    visits: Number(counted?.visits ?? 0),
  };
};

/**
 * A visit recorded by hand at the desk — the member forgot their face, the
 * terminal is down, or they are being let in for a reason no rule covers. It
 * bypasses the access check on purpose: a human already made that decision.
 */
export const recordManualVisit = async (
  gymId: string,
  memberId: string,
  workerId: string | null
): Promise<void> => {
  const [member] = await db
    .select({ branchId: members.homeBranch })
    .from(members)
    .where(and(eq(members.gymId, gymId), eq(members.memberId, memberId)))
    .limit(1);

  if (!member) {
    throw new NotFoundError("Member not found");
  }

  const now = new Date();
  const decision = await evaluateMemberAccess(gymId, memberId, now);

  await db.transaction(async (tx) => {
    await recordCheckIn(tx, {
      branchId: member.branchId,
      gymId,
      personId: memberId,
      personType: "member",
      source: "manual",
      time: now,
    });

    await countVisit(tx, decision.membershipId, now);

    await tx
      .update(attendanceSessions)
      .set({ correctedBy: workerId, isCorrected: true })
      .where(
        and(
          eq(attendanceSessions.gymId, gymId),
          eq(attendanceSessions.personId, memberId),
          eq(attendanceSessions.checkIn, now)
        )
      );
  });
};

/** How many people are inside right now, for the terminals screen header. */
export const countOpenSessions = async (gymId: string): Promise<number> => {
  const [row] = await db
    .select({ total: sql<string>`COUNT(*)` })
    .from(attendanceSessions)
    .where(
      and(
        eq(attendanceSessions.gymId, gymId),
        isNull(attendanceSessions.checkOut)
      )
    );

  return Number(row?.total ?? 0);
};
