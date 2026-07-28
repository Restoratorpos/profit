import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A worker's face at the terminal, all the way to a shift.
 *
 * This is the half of Face ID that has no UI: nobody presses anything, the
 * terminal recognises somebody and the server decides what that means. The
 * question these tests answer is the one the desk actually asks — does the first
 * scan clock them on and the second clock them off?
 *
 * The database is stubbed rather than mocked away, because the order and shape
 * of the writes *is* the behaviour: which row is inserted, which is closed, and
 * what `minutesWorked` ends up as.
 */
const harness = vi.hoisted(() => ({
  /** Results handed to each `select` chain, in the order they are awaited. */
  selects: [] as unknown[][],
  /** Every `.values()` payload written, by either the db or a transaction. */
  inserts: [] as Record<string, unknown>[],
  /** Every `.set()` payload written. */
  updates: [] as Record<string, unknown>[],
}));

vi.mock("../src/db/index.js", () => {
  // Awaiting a drizzle builder is how a query runs, so every stub chain has to
  // be a thenable. The key comes from a variable because a literal `then` is
  // linted against everywhere else in this repo.
  const thenable = "then";

  const resolving = <T>(chain: T, value: () => unknown): T => {
    Object.defineProperty(chain, thenable, {
      value: (resolve: (result: unknown) => unknown) => resolve(value()),
    });

    return chain;
  };

  const selectChain = () => {
    const chain: Record<string, unknown> = {};

    for (const method of [
      "from",
      "leftJoin",
      "innerJoin",
      "where",
      "orderBy",
      "limit",
      "groupBy",
      "offset",
    ]) {
      chain[method] = () => chain;
    }

    return resolving(chain, () => harness.selects.shift() ?? []);
  };

  const insertChain = () => ({
    values: (payload: Record<string, unknown>) => {
      harness.inserts.push(payload);

      // `parkForDecision` reads an insertId back off this.
      return resolving({}, () => [{ insertId: 1 }]);
    },
  });

  const updateChain = () => ({
    set: (payload: Record<string, unknown>) => {
      harness.updates.push(payload);

      return resolving({ where: () => resolving({}, () => []) }, () => []);
    },
  });

  const writer = { insert: insertChain, update: updateChain };

  return {
    db: {
      ...writer,
      select: selectChain,
      transaction: async (work: (tx: unknown) => Promise<unknown>) =>
        await work(writer),
    },
  };
});

const { ingestTerminalEvent } = await import(
  "../src/services/attendance.service.js"
);

const GYM = "gym_00000000000000001";
const WORKER = "wrk_0000000000000001";

/** MAIN: one reader on the door, which is both the way in and the way out. */
const MAIN = { branchId: "brn_1", deviceId: "dev_1", direction: "both" };

const credentialRow = [
  { credentialId: "crd_1", ownerId: WORKER, ownerType: "worker" },
];

const workerRow = [{ branchId: "brn_1", name: "Dilshod" }];

const openShift = (checkIn: Date) => [
  { checkIn, checkOut: null, sessionId: 77 },
];

/**
 * The four reads every scan makes, in order: the credential, the person behind
 * it, the debounce check, and the open shift (or the lack of one).
 */
const scanReads = (session: unknown[] = []) => {
  harness.selects = [credentialRow, workerRow, [], session];
};

const scanAt = (hour: number, minute = 0) =>
  new Date(2026, 6, 26, hour, minute, 0);

/**
 * A scan as it reaches the service. `attendanceStatus` is null here because a
 * terminal that is not running in attendance mode does not report one — see the
 * last test for what happens when it does.
 */
const scan = (at: Date, attendanceStatus: string | null = null) => ({
  attendanceStatus,
  employeeNo: WORKER,
  eventTime: at,
});

const sessionInserts = () =>
  harness.inserts.filter((row) => "status" in row && "workDate" in row);

const eventInserts = () =>
  harness.inserts.filter((row) => "direction" in row && "source" in row);

beforeEach(() => {
  harness.selects = [];
  harness.inserts = [];
  harness.updates = [];
});

describe("a worker's face at the terminal", () => {
  it("opens a shift on the first scan of the day", async () => {
    scanReads();

    const outcome = await ingestTerminalEvent(GYM, MAIN, scan(scanAt(9, 15)));

    expect(outcome).toEqual({
      direction: "in",
      name: "Dilshod",
      status: "recorded",
    });

    const [session] = sessionInserts();

    expect(session.personType).toBe("worker");
    expect(session.status).toBe("open");
    expect(session.checkOut).toBeNull();

    const [event] = eventInserts();

    expect(event.direction).toBe("in");
    // Not "manual": payroll should be able to tell a scan from a button.
    expect(event.source).toBe("face");
  });

  it("closes that shift on the next scan, and counts the hours", async () => {
    scanReads(openShift(scanAt(9, 15)));

    const outcome = await ingestTerminalEvent(GYM, MAIN, scan(scanAt(17, 45)));

    expect(outcome).toEqual({
      direction: "out",
      name: "Dilshod",
      status: "recorded",
    });

    // Closed, not opened: a second shift row would double the day's pay.
    expect(sessionInserts()).toHaveLength(0);

    const [closed] = harness.updates;

    expect(closed.status).toBe("closed");
    expect(closed.checkOut).toEqual(scanAt(17, 45));
    expect(closed.minutesWorked).toBe(510);

    expect(eventInserts()[0].direction).toBe("out");
  });

  it("never asks whether staff are entitled to be here", async () => {
    scanReads();

    await ingestTerminalEvent(GYM, MAIN, scan(scanAt(6, 30)));

    // A membership check would have read the plans table; the four reads a scan
    // makes are all that happened, so nothing looked for one. Staff arriving
    // before opening hours is the normal case, not a denial.
    expect(harness.selects).toHaveLength(0);
    expect(sessionInserts()[0].needsReview).toBe(false);
  });

  it("ignores a face it does not know", async () => {
    harness.selects = [[]];

    const outcome = await ingestTerminalEvent(GYM, MAIN, scan(scanAt(9, 15)));

    expect(outcome).toEqual({
      reason: "unknown_credential",
      status: "ignored",
    });
    expect(harness.inserts).toHaveLength(0);
  });

  it("ignores the second read when the terminal double-fires", async () => {
    // A scan a moment ago: the debounce read returns it rather than nothing.
    harness.selects = [
      credentialRow,
      workerRow,
      [{ eventTime: scanAt(9, 15) }],
      [],
    ];

    const outcome = await ingestTerminalEvent(GYM, MAIN, scan(scanAt(9, 15)));

    expect(outcome).toEqual({ reason: "duplicate", status: "ignored" });
    expect(harness.inserts).toHaveLength(0);
  });

  it("lets a reader wired as an exit override the toggle", async () => {
    scanReads(openShift(scanAt(9, 15)));

    await ingestTerminalEvent(
      GYM,
      { ...MAIN, direction: "out" },
      scan(scanAt(17, 45))
    );

    expect(harness.updates[0].status).toBe("closed");
  });

  /**
   * The one configuration that breaks the toggle, pinned so it is a known
   * behaviour rather than a surprise at the door.
   *
   * `attendanceStatus` is trusted ahead of the toggle on purpose — a terminal
   * running in attendance mode knows better than we do. But a MinMoe left on one
   * fixed status reports "checkIn" on every scan, and then nobody can ever clock
   * off: the shift stays open and is flagged for the desk instead.
   */
  it("believes the terminal over the toggle, even when it repeats itself", async () => {
    scanReads(openShift(scanAt(9, 15)));

    await ingestTerminalEvent(GYM, MAIN, scan(scanAt(17, 45), "checkIn"));

    expect(harness.updates[0].status).toBeUndefined();
    // Flagged rather than closed — which is the tell that the terminal's
    // attendance status needs turning off.
    expect(harness.updates[0].needsReview).toBe(true);
  });
});
