import { randomBytes } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { config } from "../config/index.js";
import { db } from "../db/index.js";
import {
  branches,
  credentials,
  devices,
  ID_LENGTH,
  members,
  workers,
} from "../db/schema.js";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from "../lib/errors.js";
import {
  captureFaceAtDevice,
  configurePushHost,
  DeviceError,
  type DeviceInfo,
  type DeviceTarget,
  deletePerson,
  ensureEventPictures,
  fetchDeviceInfo,
  fetchEvents,
  hasFaceOnDevice,
  openDoor,
  putFace,
  putPerson,
  toDeviceEmployeeNo,
} from "../lib/hikvision.js";
import { logger } from "../lib/logger.js";
import {
  canStoreSecrets,
  decryptSecret,
  encryptSecret,
} from "../lib/secret.js";
import type {
  CreateDeviceInput,
  EnrollInput,
  SyncEventsInput,
  UpdateDeviceInput,
} from "../schemas/device.js";
import {
  clearUnknownScan,
  ingestTerminalEvent,
  readUnknownScan,
} from "./attendance.service.js";

/**
 * Access terminals: the rows, and the calls that go out to them.
 *
 * Every query filters by `gymId`. A terminal is a door — reaching one belonging
 * to another gym would not be a data leak, it would be a physical one.
 */

/** What a terminal row looks like to the UI. Never carries the password. */
export interface DeviceView {
  direction: string | null;
  enrolledCount: number;
  id: string;
  ipAddress: string | null;
  isActive: boolean;
  lastSeen: string | null;
  location: string | null;
  name: string;
  port: number | null;
  username: string | null;
  /** The path this device should POST to; shown so it can be set by hand. */
  webhookPath: string;
}

const toIsoDate = (value: Date | string | null): string | null => {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : String(value);
};

const webhookPathOf = (key: string | null): string =>
  key ? `/attendance/hik/${key}` : "";

const findDevice = async (gymId: string, deviceId: string) => {
  const [device] = await db
    .select()
    .from(devices)
    .where(and(eq(devices.gymId, gymId), eq(devices.deviceId, deviceId)))
    .limit(1);

  if (!device) {
    throw new NotFoundError("Terminal not found");
  }

  return device;
};

/** The connection details, decrypted, for a call that is about to go out. */
const targetOf = (device: typeof devices.$inferSelect): DeviceTarget => {
  if (!(device.ipAddress && device.username && device.passwordEnc)) {
    throw new BadRequestError(
      "This terminal has no address or credentials saved yet"
    );
  }

  return {
    host: device.ipAddress,
    password: decryptSecret(device.passwordEnc),
    port: device.port ?? 80,
    username: device.username,
  };
};

const enrolledCounts = async (gymId: string): Promise<Map<string, number>> => {
  const rows = await db
    .select({ deviceId: credentials.deviceId })
    .from(credentials)
    .where(and(eq(credentials.gymId, gymId), eq(credentials.isActive, true)));

  const counts = new Map<string, number>();

  for (const row of rows) {
    if (row.deviceId) {
      counts.set(row.deviceId, (counts.get(row.deviceId) ?? 0) + 1);
    }
  }

  return counts;
};

export const listDevices = async (gymId: string): Promise<DeviceView[]> => {
  const [rows, counts] = await Promise.all([
    db
      .select()
      .from(devices)
      .where(eq(devices.gymId, gymId))
      .orderBy(asc(devices.deviceName)),
    enrolledCounts(gymId),
  ]);

  return rows.map((row) => ({
    direction: row.direction,
    enrolledCount: counts.get(row.deviceId) ?? 0,
    id: row.deviceId,
    ipAddress: row.ipAddress,
    isActive: row.isActive ?? false,
    lastSeen: toIsoDate(row.lastSeen),
    location: row.location,
    name: row.deviceName ?? "",
    port: row.port,
    username: row.username,
    webhookPath: webhookPathOf(row.webhookKey),
  }));
};

const resolveBranchId = async (
  gymId: string,
  workerId: string
): Promise<string | null> => {
  const [worker] = await db
    .select({ branchId: workers.branchId })
    .from(workers)
    .where(and(eq(workers.gymId, gymId), eq(workers.workerId, workerId)))
    .limit(1);

  if (worker?.branchId) {
    return worker.branchId;
  }

  const [branch] = await db
    .select({ id: branches.branchId })
    .from(branches)
    .where(eq(branches.gymId, gymId))
    .limit(1);

  return branch?.id ?? null;
};

export const createDevice = async (
  gymId: string,
  input: CreateDeviceInput,
  workerId: string | null
): Promise<DeviceView> => {
  if (!workerId) {
    throw new UnauthorizedError("Missing x-worker-id");
  }

  if (!canStoreSecrets()) {
    throw new BadRequestError(
      "DEVICE_SECRET is not set — add it to apps/backend/.env.local before saving a terminal password"
    );
  }

  const existing = await db
    .select({ id: devices.deviceId })
    .from(devices)
    .where(
      and(eq(devices.gymId, gymId), eq(devices.ipAddress, input.ipAddress))
    )
    .limit(1);

  if (existing.length > 0) {
    throw new ConflictError("A terminal with this address already exists");
  }

  const deviceId = nanoid(ID_LENGTH);
  // The device authenticates to us with this and nothing else, so it is minted
  // here and never accepted from a caller.
  const webhookKey = randomBytes(16).toString("hex");

  await db.insert(devices).values({
    branchId: await resolveBranchId(gymId, workerId),
    createdAt: new Date(),
    deviceId,
    deviceName: input.name,
    deviceType: "face",
    direction: input.direction,
    gymId,
    ipAddress: input.ipAddress,
    isActive: input.isActive,
    lastSeen: null,
    location: input.location ?? null,
    passwordEnc: encryptSecret(input.password),
    port: input.port,
    username: input.username,
    webhookKey,
  });

  return {
    direction: input.direction,
    enrolledCount: 0,
    id: deviceId,
    ipAddress: input.ipAddress,
    isActive: input.isActive,
    lastSeen: null,
    location: input.location ?? null,
    name: input.name,
    port: input.port,
    username: input.username,
    webhookPath: webhookPathOf(webhookKey),
  };
};

export const updateDevice = async (
  gymId: string,
  deviceId: string,
  input: UpdateDeviceInput
): Promise<void> => {
  await findDevice(gymId, deviceId);

  const changes: Partial<typeof devices.$inferInsert> = {};

  if (input.name !== undefined) {
    changes.deviceName = input.name;
  }

  if (input.ipAddress !== undefined) {
    changes.ipAddress = input.ipAddress;
  }

  if (input.port !== undefined) {
    changes.port = input.port;
  }

  if (input.username !== undefined) {
    changes.username = input.username;
  }

  if (input.location !== undefined) {
    changes.location = input.location ?? null;
  }

  if (input.direction !== undefined) {
    changes.direction = input.direction;
  }

  if (input.isActive !== undefined) {
    changes.isActive = input.isActive;
  }

  // An absent password means "leave it alone" — the edit form never receives
  // the stored one, so it has nothing to send back.
  if (input.password) {
    if (!canStoreSecrets()) {
      throw new BadRequestError(
        "DEVICE_SECRET is not set — add it to apps/backend/.env.local before saving a terminal password"
      );
    }

    changes.passwordEnc = encryptSecret(input.password);
  }

  if (Object.keys(changes).length === 0) {
    return;
  }

  await db
    .update(devices)
    .set(changes)
    .where(and(eq(devices.gymId, gymId), eq(devices.deviceId, deviceId)));
};

/**
 * Forgets the terminal. The credentials issued through it are revoked rather
 * than deleted, because the attendance events that reference them are history.
 */
export const deleteDevice = async (
  gymId: string,
  deviceId: string
): Promise<void> => {
  await findDevice(gymId, deviceId);

  await db.transaction(async (tx) => {
    await tx
      .update(credentials)
      .set({
        isActive: false,
        revokedAt: new Date(),
        revokedReason: "terminal removed",
      })
      .where(
        and(eq(credentials.gymId, gymId), eq(credentials.deviceId, deviceId))
      );

    await tx
      .delete(devices)
      .where(and(eq(devices.gymId, gymId), eq(devices.deviceId, deviceId)));
  });
};

/** Reaches out and asks the terminal who it is. Stamps `last_seen` on success. */
export const testDevice = async (
  gymId: string,
  deviceId: string
): Promise<DeviceInfo> => {
  const device = await findDevice(gymId, deviceId);
  const info = await fetchDeviceInfo(targetOf(device));

  await db
    .update(devices)
    .set({ lastSeen: new Date() })
    .where(and(eq(devices.gymId, gymId), eq(devices.deviceId, deviceId)));

  return info;
};

/**
 * Re-tells every terminal in a gym where to push, at startup.
 *
 * A terminal is configured once and then remembers that address forever. When
 * this server's own address moves — a DHCP lease, a machine swapped, a till
 * carried to another room — the device keeps posting to where it was told, and
 * **nothing reports it**: the device cannot say that its destination refused the
 * connection, and this server never hears from it again. Meanwhile the device
 * page still reads "connected", because that only tests the call in the other
 * direction. Attendance simply stops, silently.
 *
 * That happened between 28 and 30 July 2026: the desk PC moved from
 * .106 to .105 and two days of scans went nowhere.
 *
 * Re-applying on every boot removes the failure rather than reporting it. It is
 * unconditional instead of compared-first because the push config is idempotent
 * and a read is a second round trip to a device that may be asleep; writing it
 * costs one call and is correct whatever the device currently holds.
 *
 * Scoped to one gym, which is why it needs `DEVICE_GYM_ID`. The devices table
 * spans every gym in this database, and their terminals sit on private ranges
 * that overlap — `192.168.1.100` is a different box in each one. Walking all of
 * them would mean this desk reconfiguring whatever answers on its own LAN at
 * another gym's address, handing it another gym's webhook key.
 */
export const republishPushHosts = async (gymId: string): Promise<void> => {
  const rows = await db
    .select({ deviceId: devices.deviceId, name: devices.deviceName })
    .from(devices)
    .where(and(eq(devices.gymId, gymId), eq(devices.isActive, true)));

  for (const row of rows) {
    try {
      const destination = await enablePush(gymId, row.deviceId);

      logger.info(
        { destination, device: row.name },
        "Terminal push destination re-applied"
      );
    } catch (error) {
      /*
       * Logged, never thrown. A terminal that is unplugged, asleep, or has had
       * its password changed must not stop the server starting — the desk still
       * needs to sell things, and the door is the one thing that keeps working
       * on its own.
       */
      logger.warn(
        { device: row.name, err: error },
        "Could not re-apply the push destination for this terminal"
      );
    }
  }
};

/**
 * Tells the terminal where to POST its scans. Needs DEVICE_CALLBACK_HOST,
 * because the address the *device* can reach us on is a LAN address that no
 * incoming request can tell us.
 */
export const enablePush = async (
  gymId: string,
  deviceId: string
): Promise<{ host: string; path: string; port: number }> => {
  const device = await findDevice(gymId, deviceId);

  if (!config.devices.callbackHost) {
    throw new BadRequestError(
      "DEVICE_CALLBACK_HOST is not set — the terminal needs the LAN address of this server to push events to"
    );
  }

  if (!device.webhookKey) {
    throw new BadRequestError("This terminal has no webhook key");
  }

  const destination = {
    host: config.devices.callbackHost,
    path: webhookPathOf(device.webhookKey),
    port: config.devices.callbackPort,
  };

  const target = targetOf(device);

  await configurePushHost(target, destination);

  /*
   * A push without pictures is a push that cannot enrol anybody, and the device
   * ships with them off. Configuring one without the other is what made the
   * face dialog sit there saying nothing, so the two travel together now.
   */
  await ensureEventPictures(target);

  return destination;
};

export const openDeviceDoor = async (
  gymId: string,
  deviceId: string
): Promise<void> => {
  const device = await findDevice(gymId, deviceId);

  await openDoor(targetOf(device));
};

/** What a MinMoe will accept, with headroom over the 200 KB the browser aims at. */
const MAX_PHOTO_BYTES = 512_000;

const decodeBase64Image = (value: string): Uint8Array => {
  // Accepts a bare base64 string or a full `data:image/jpeg;base64,...` URL.
  const comma = value.indexOf(",");
  const payload =
    value.startsWith("data:") && comma > -1 ? value.slice(comma + 1) : value;

  const bytes = Buffer.from(payload, "base64");

  if (bytes.length === 0) {
    throw new BadRequestError("The photo could not be read");
  }

  /*
   * A terminal takes a few hundred kilobytes, not a phone's four megabytes, and
   * refuses anything bigger with a quality error that reads like the device's
   * fault. Failing here instead says what is actually wrong. The browser already
   * downscales (see lib/images.ts), so anything arriving over this came from
   * somewhere that skipped that step.
   */
  if (bytes.length > MAX_PHOTO_BYTES) {
    throw new BadRequestError(
      `The photo is ${Math.round(bytes.length / 1000)} KB — terminals take up to ${
        MAX_PHOTO_BYTES / 1000
      } KB. Use a smaller, straight-on portrait.`
    );
  }

  return new Uint8Array(bytes);
};

export interface EnrollResult {
  credentialId: string;
  /** What the *terminal* now knows them by, which is not always their own id. */
  employeeNo: string;
  hasFace: boolean;
  name: string;
}

/**
 * Puts a person on the terminal and records the credential that ties their
 * scans back to them.
 *
 * The credential stores their own id, not the terminal's spelling of it. The two
 * are usually the same string, but not always: this firmware only accepts an
 * alphanumeric `employeeNo`, and a `nanoid(20)` can contain `-` or `_`, so
 * `lib/hikvision.ts` encodes on the way out and decodes every scan on the way
 * back. Keeping the credential in *our* alphabet means `resolveCredential` looks
 * up exactly what the rest of the schema stores.
 *
 * The face itself stays on the device — we store that one was enrolled, never
 * the image or the template.
 */
export const enrollPerson = async (
  gymId: string,
  deviceId: string,
  input: EnrollInput,
  workerId: string | null
): Promise<EnrollResult> => {
  if (!workerId) {
    throw new UnauthorizedError("Missing x-worker-id");
  }

  const device = await findDevice(gymId, deviceId);
  const target = targetOf(device);

  const name = await (async () => {
    if (input.personType === "worker") {
      const [row] = await db
        .select({ name: workers.fullname })
        .from(workers)
        .where(
          and(eq(workers.gymId, gymId), eq(workers.workerId, input.personId))
        )
        .limit(1);

      return row?.name ?? null;
    }

    const [row] = await db
      .select({ name: members.fullname })
      .from(members)
      .where(
        and(eq(members.gymId, gymId), eq(members.memberId, input.personId))
      )
      .limit(1);

    return row?.name ?? null;
  })();

  if (name === null) {
    throw new NotFoundError("Person not found");
  }

  await putPerson(target, { employeeNo: input.personId, name });

  const hasFace = Boolean(input.photo);

  if (input.photo) {
    await putFace(target, input.personId, decodeBase64Image(input.photo));
  }

  const credentialId = await recordCredential(
    gymId,
    deviceId,
    input.personType,
    input.personId,
    workerId
  );

  return {
    credentialId,
    employeeNo: toDeviceEmployeeNo(input.personId),
    hasFace,
    name,
  };
};

/**
 * The row that turns a scan back into a person, created once per person per
 * terminal. Re-enrolling revives the existing one rather than stacking a second
 * that resolves to the same member.
 */
const recordCredential = async (
  gymId: string,
  deviceId: string,
  personType: "member" | "worker",
  personId: string,
  workerId: string | null
): Promise<string> => {
  const [existing] = await db
    .select({ id: credentials.credentialId })
    .from(credentials)
    .where(
      and(
        eq(credentials.gymId, gymId),
        eq(credentials.credentialValue, personId),
        eq(credentials.deviceId, deviceId)
      )
    )
    .limit(1);

  if (existing) {
    await db
      .update(credentials)
      .set({ isActive: true, revokedAt: null, revokedReason: null })
      .where(eq(credentials.credentialId, existing.id));

    return existing.id;
  }

  const credentialId = nanoid(ID_LENGTH);

  await db.insert(credentials).values({
    createdBy: workerId,
    credentialId,
    credentialType: "face",
    credentialValue: personId,
    deviceId,
    gymId,
    isActive: true,
    isPrimary: true,
    issuedAt: new Date(),
    ownerId: personId,
    ownerType: personType,
    revokedAt: null,
    revokedReason: null,
  });

  return credentialId;
};

/**
 * Enrolling from the terminal's own camera, without its admin menu.
 *
 * A MinMoe pushes a snapshot with every scan it fails to recognise. So the desk
 * arms a capture, the person looks at the terminal, the terminal says
 * "authentication failed" — and that refusal carries exactly the photo we want,
 * taken by the camera that will do the matching. We enrol it against the member
 * who is waiting.
 *
 * Held in memory rather than Redis: the window is a minute or two, one server
 * owns it, and a restart mid-capture costs a button press. A dependency that can
 * be down is not worth adding for that.
 */
interface ArmedCapture {
  expiresAt: number;
  personId: string;
  personType: "member" | "worker";
}

const armedCaptures = new Map<string, ArmedCapture>();

/** Long enough to walk to the door, short enough not to catch the next person. */
const CAPTURE_WINDOW_MS = 120_000;

export const armFaceCapture = (
  gymId: string,
  personType: "member" | "worker",
  personId: string
): void => {
  armedCaptures.set(gymId, {
    expiresAt: Date.now() + CAPTURE_WINDOW_MS,
    personId,
    personType,
  });
};

export const disarmFaceCapture = (gymId: string): void => {
  armedCaptures.delete(gymId);
};

const takeArmedCapture = (gymId: string): ArmedCapture | null => {
  const armed = armedCaptures.get(gymId);

  if (!armed) {
    return null;
  }

  if (armed.expiresAt < Date.now()) {
    armedCaptures.delete(gymId);

    return null;
  }

  return armed;
};

/**
 * Enrols a snapshot the terminal pushed against whoever the desk armed.
 *
 * Returns null when nothing is armed, which is the normal case: most
 * unrecognised faces at a door are strangers, not enrolments in progress.
 */
export const captureFaceFromEvent = async (
  gymId: string,
  picture: Uint8Array,
  workerId: string | null
): Promise<{ personId: string } | null> => {
  const armed = takeArmedCapture(gymId);

  if (!armed) {
    return null;
  }

  const active = await activeDevicesOf(gymId);
  let enrolled = 0;

  for (const device of active) {
    try {
      await putFace(targetOf(device), armed.personId, picture);
      await recordCredential(
        gymId,
        device.deviceId,
        armed.personType,
        armed.personId,
        workerId
      );
      enrolled += 1;
    } catch {
      // Another terminal may still take it; the dialog reports what stuck.
    }
  }

  if (enrolled === 0) {
    return null;
  }

  // One capture, one face: leaving it armed would enrol the next stranger too.
  disarmFaceCapture(gymId);

  return { personId: armed.personId };
};

export interface TerminalFaceStatus {
  /** What went wrong reaching this one, if anything. */
  error: string | null;
  /** True once the device holds a face for them. */
  hasFace: boolean;
  id: string;
  name: string;
}

/**
 * Makes sure every active terminal knows this person, then reports which of
 * them actually hold a face.
 *
 * Registering is idempotent — `putPerson` falls through to a modify when the
 * `employeeNo` is already there — which is what lets the desk press this
 * repeatedly while somebody stands at the door getting their photo taken.
 *
 * One terminal being unreachable does not fail the call. Its row comes back
 * carrying the reason instead, because "the one by the back door is unplugged"
 * is exactly what the operator needs to be told.
 */
export const syncFaceStatus = async (
  gymId: string,
  personType: "member" | "worker",
  personId: string,
  workerId: string | null
): Promise<TerminalFaceStatus[]> => {
  const active = await activeDevicesOf(gymId);

  if (active.length === 0) {
    throw new BadRequestError(
      "No active terminal — add one on the Terminals screen first"
    );
  }

  const statuses: TerminalFaceStatus[] = [];

  for (const device of active) {
    const name = device.deviceName ?? device.deviceId;

    try {
      await enrollPerson(
        gymId,
        device.deviceId,
        { personId, personType },
        workerId
      );

      statuses.push({
        error: null,
        hasFace: await hasFaceOnDevice(targetOf(device), personId),
        id: device.deviceId,
        name,
      });
    } catch (error) {
      statuses.push({
        error: error instanceof Error ? error.message : "unknown error",
        hasFace: false,
        id: device.deviceId,
        name,
      });
    }
  }

  return statuses;
};

export interface FaceSyncResult {
  /** How many terminals now know this face. */
  enrolled: number;
  /** Terminals that refused, by name, so the desk knows what to go and fix. */
  failed: { name: string; reason: string }[];
}

const activeDevicesOf = async (gymId: string) =>
  await db
    .select()
    .from(devices)
    .where(and(eq(devices.gymId, gymId), eq(devices.isActive, true)))
    .orderBy(asc(devices.deviceName));

/**
 * Puts a face on **every** active terminal, not one chosen from a list.
 *
 * A gym with a reader on the way in and another on the way out needs the face
 * on both: enrolled on one only, a member gets in and then cannot get out, which
 * is a worse failure than not being enrolled at all. Making that a checkbox
 * would be offering the operator a way to get it wrong.
 *
 * A terminal that refuses does not fail the whole enrollment — the others still
 * take it, and the ones that did not are named so they can be retried.
 */
export const enrollFaceEverywhere = async (
  gymId: string,
  personType: "member" | "worker",
  personId: string,
  /**
   * Omitted registers the person without a face, so it can be captured at the
   * terminal itself — the better photo, taken by the camera that will match it.
   */
  photo: string | undefined,
  workerId: string | null
): Promise<FaceSyncResult> => {
  const active = await activeDevicesOf(gymId);

  if (active.length === 0) {
    throw new BadRequestError(
      "No active terminal to enrol on — add one on the Terminals screen first"
    );
  }

  const failed: { name: string; reason: string }[] = [];
  let enrolled = 0;

  for (const device of active) {
    try {
      await enrollPerson(
        gymId,
        device.deviceId,
        { personId, personType, photo },
        workerId
      );
      enrolled += 1;
    } catch (error) {
      failed.push({
        name: device.deviceName ?? device.deviceId,
        reason: error instanceof Error ? error.message : "unknown error",
      });
    }
  }

  if (enrolled === 0) {
    throw new DeviceError(
      `No terminal accepted the face: ${failed
        .map((entry) => `${entry.name} — ${entry.reason}`)
        .join("; ")}`
    );
  }

  return { enrolled, failed };
};

/**
 * Takes the photo at the terminal, then puts it on all of them.
 *
 * The capture happens at one device because a person can only stand in front of
 * one; the enrolment still goes everywhere, for the reason above — a face on the
 * entry reader and not the exit reader locks somebody in.
 *
 * This is the primary way a face gets on a terminal. `armFaceCapture` below is
 * the older route and stays as a fallback, but it can only ever enrol a face the
 * device does not already recognise, so it is not something to rely on.
 */
export const captureFaceAtTerminal = async (
  gymId: string,
  personType: "member" | "worker",
  personId: string,
  /** Which terminal the person is standing at. The only one, when there is one. */
  deviceId: string | null,
  workerId: string | null
): Promise<FaceSyncResult> => {
  const active = await activeDevicesOf(gymId);

  if (active.length === 0) {
    throw new BadRequestError(
      "No active terminal to capture at — add one on the Terminals screen first"
    );
  }

  const device = deviceId
    ? active.find((row) => row.deviceId === deviceId)
    : active[0];

  if (!device) {
    throw new NotFoundError("Terminal not found");
  }

  /*
   * The person has to exist on the device before its camera will capture for
   * them on some firmware, and enrolling first also means a capture that
   * succeeds cannot fail afterwards on "unknown employeeNo".
   */
  await enrollPerson(
    gymId,
    device.deviceId,
    { personId, personType },
    workerId
  );

  const picture = await captureFaceAtDevice(targetOf(device));

  const result = await enrollFaceEverywhere(
    gymId,
    personType,
    personId,
    Buffer.from(picture).toString("base64"),
    workerId
  );

  // They have a face now; anything still armed would only catch a stranger.
  disarmFaceCapture(gymId);

  return result;
};

/**
 * Removes a face from every terminal that holds it. Best-effort per device: a
 * terminal that is unreachable still gets its credential revoked here, so the
 * scan stops counting immediately and the stale record on the box is cleaned up
 * next time somebody re-enrols.
 */
export const revokeFaceEverywhere = async (
  gymId: string,
  personId: string
): Promise<void> => {
  const rows = await db
    .select({
      credentialId: credentials.credentialId,
      deviceId: credentials.deviceId,
    })
    .from(credentials)
    .where(
      and(
        eq(credentials.gymId, gymId),
        eq(credentials.ownerId, personId),
        eq(credentials.isActive, true)
      )
    );

  for (const row of rows) {
    if (!row.deviceId) {
      continue;
    }

    try {
      await revokePerson(gymId, row.deviceId, row.credentialId);
    } catch {
      // The device is unreachable or has already forgotten them. Revoking the
      // credential is what actually stops the scan counting, so do that anyway.
      await db
        .update(credentials)
        .set({
          isActive: false,
          revokedAt: new Date(),
          revokedReason: "revoked at the desk",
        })
        .where(eq(credentials.credentialId, row.credentialId));
    }
  }
};

/**
 * Takes the face behind an unrecognised scan off the terminal that reported it.
 *
 * There is no credential row to revoke — that absence is the whole problem — so
 * this deletes by the id the device itself reported. `deletePerson` re-encodes
 * it the way the terminal stores it, which is the exact inverse of the decode
 * the event went through, so it round-trips whether the box holds one of our
 * encodings or an id typed into its own admin menu.
 *
 * The notice is cleared only once the device has actually forgotten them. A
 * failed delete leaves it standing so the desk can try again — and it expires
 * on its own, so an unreachable terminal cannot pin it there.
 */
export const removeUnknownFromTerminal = async (
  gymId: string
): Promise<void> => {
  const scan = readUnknownScan(gymId);

  if (!scan) {
    throw new NotFoundError("That scan is no longer on screen");
  }

  const device = await findDevice(gymId, scan.deviceId);

  await deletePerson(targetOf(device), scan.employeeNo);

  clearUnknownScan(gymId);
};

/**
 * Wipes a person from every terminal and drops their credential rows outright.
 *
 * The difference from `revokeFaceEverywhere` is that this one refuses to be
 * partial. Revoking tolerates an unreachable box because the credential going
 * inactive is what stops a scan counting — the person still exists here, and
 * the stale record gets cleaned up on the next enrolment. Deleting them does
 * not have that fallback: a face left on a terminal after the member is gone
 * opens a door for somebody this gym can no longer name, which is precisely the
 * "Noma'lum skan" the attendance banner exists to report.
 *
 * So a terminal that cannot be reached throws, and the caller abandons the
 * delete with the member still intact.
 */
export const purgeFaceEverywhere = async (
  gymId: string,
  personId: string
): Promise<void> => {
  const rows = await db
    .select({
      credentialValue: credentials.credentialValue,
      deviceId: credentials.deviceId,
    })
    .from(credentials)
    .where(
      and(eq(credentials.gymId, gymId), eq(credentials.ownerId, personId))
    );

  for (const row of rows) {
    if (!(row.deviceId && row.credentialValue)) {
      continue;
    }

    const [device] = await db
      .select()
      .from(devices)
      .where(and(eq(devices.gymId, gymId), eq(devices.deviceId, row.deviceId)))
      .limit(1);

    // The terminal itself is gone from the CRM, so there is nothing left
    // holding the face. Not an error — just nothing to do.
    if (!device) {
      continue;
    }

    await deletePerson(targetOf(device), row.credentialValue);
  }

  await db
    .delete(credentials)
    .where(
      and(eq(credentials.gymId, gymId), eq(credentials.ownerId, personId))
    );
};

/** Takes a person off the terminal and revokes their credential. */
export const revokePerson = async (
  gymId: string,
  deviceId: string,
  credentialId: string
): Promise<void> => {
  const device = await findDevice(gymId, deviceId);

  const [credential] = await db
    .select()
    .from(credentials)
    .where(
      and(
        eq(credentials.gymId, gymId),
        eq(credentials.credentialId, credentialId)
      )
    )
    .limit(1);

  if (!credential) {
    throw new NotFoundError("Credential not found");
  }

  if (credential.credentialValue) {
    await deletePerson(targetOf(device), credential.credentialValue);
  }

  await db
    .update(credentials)
    .set({
      isActive: false,
      revokedAt: new Date(),
      revokedReason: "revoked at the desk",
    })
    .where(eq(credentials.credentialId, credentialId));
};

export interface EnrolledPerson {
  credentialId: string;
  issuedAt: string | null;
  name: string;
  personId: string;
  personType: string;
}

export const listEnrolled = async (
  gymId: string,
  deviceId: string
): Promise<EnrolledPerson[]> => {
  const rows = await db
    .select({
      credentialId: credentials.credentialId,
      issuedAt: credentials.issuedAt,
      memberName: members.fullname,
      ownerId: credentials.ownerId,
      ownerType: credentials.ownerType,
      workerName: workers.fullname,
    })
    .from(credentials)
    .leftJoin(
      workers,
      and(
        eq(workers.workerId, credentials.ownerId),
        eq(credentials.ownerType, "worker")
      )
    )
    .leftJoin(
      members,
      and(
        eq(members.memberId, credentials.ownerId),
        eq(credentials.ownerType, "member")
      )
    )
    .where(
      and(
        eq(credentials.gymId, gymId),
        eq(credentials.deviceId, deviceId),
        eq(credentials.isActive, true)
      )
    );

  return rows.map((row) => ({
    credentialId: row.credentialId,
    issuedAt: toIsoDate(row.issuedAt),
    name: row.workerName ?? row.memberName ?? "",
    personId: row.ownerId ?? "",
    personType: row.ownerType ?? "worker",
  }));
};

export interface SyncResult {
  ignored: number;
  read: number;
  recorded: number;
}

/**
 * Pulls what the terminal buffered and feeds it through the same ingest the push
 * webhook uses — including the debounce, which is what makes re-running a sync
 * safe rather than a way to double every shift.
 */
export const syncEvents = async (
  gymId: string,
  deviceId: string,
  input: SyncEventsInput
): Promise<SyncResult> => {
  const device = await findDevice(gymId, deviceId);
  const to = new Date();
  const from = new Date(to.getTime() - input.hours * 3_600_000);

  const events = await fetchEvents(targetOf(device), { from, to });

  let recorded = 0;

  for (const event of events) {
    const outcome = await ingestTerminalEvent(
      gymId,
      {
        branchId: device.branchId,
        deviceId: device.deviceId,
        deviceName: device.deviceName,
        direction: device.direction,
      },
      event
    );

    if (outcome.status === "recorded") {
      recorded += 1;
    }
  }

  await db
    .update(devices)
    .set({ lastSeen: new Date() })
    .where(and(eq(devices.gymId, gymId), eq(devices.deviceId, deviceId)));

  return { ignored: events.length - recorded, read: events.length, recorded };
};

/**
 * Finds the terminal a push belongs to from its webhook key alone. This is the
 * one lookup in the file that is not gym-scoped, because the key *is* the scope:
 * it is 128 bits, minted per device, and yields the gym it belongs to.
 */
export const findDeviceByWebhookKey = async (key: string) => {
  const [device] = await db
    .select({
      branchId: devices.branchId,
      deviceId: devices.deviceId,
      deviceName: devices.deviceName,
      direction: devices.direction,
      gymId: devices.gymId,
      isActive: devices.isActive,
    })
    .from(devices)
    .where(eq(devices.webhookKey, key))
    .limit(1);

  return device ?? null;
};
