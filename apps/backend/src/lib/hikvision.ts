import { createHash, randomBytes } from "node:crypto";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { AppError } from "./errors.js";

/**
 * A small ISAPI client for Hikvision access terminals (built against a
 * DS-K1T342MX-E1 MinMoe).
 *
 * Two things about these devices shape this file:
 *
 * 1. **They speak HTTP Digest, not Basic.** `fetch` has no digest support, so
 *    every call is made twice on a cold connection: once to collect the
 *    challenge from the 401, once with the computed response. The nonce is
 *    cached per device so the second and later calls are single round trips.
 * 2. **They are half JSON and half XML.** Person and event endpoints take
 *    `?format=json`; the notification-host and door-control endpoints only ever
 *    speak XML. Both are here rather than pretending the device is consistent.
 *
 * Nothing in this file touches the database or knows what a gym is — it is the
 * device protocol and nothing else.
 */

export class DeviceError extends AppError {
  constructor(message: string, status: ContentfulStatusCode = 502) {
    super(status, "device_error", message);
  }
}

export interface DeviceTarget {
  host: string;
  password: string;
  port: number;
  username: string;
}

export interface DeviceInfo {
  deviceName: string | null;
  firmwareVersion: string | null;
  macAddress: string | null;
  model: string | null;
  serialNumber: string | null;
}

/** One scan, in the shape the rest of the server cares about. */
export interface TerminalEvent {
  /** Hikvision's own attendance intent when the device is in that mode. */
  attendanceStatus: string | null;
  cardNo: string | null;
  /** The `employeeNo` the person is enrolled under. Absent for a stranger. */
  employeeNo: string | null;
  eventTime: Date;
  major: number | null;
  minor: number | null;
  name: string | null;
  /** The device's own serial for the event, used to drop duplicates. */
  serialNo: number | null;
}

const md5 = (value: string): string =>
  createHash("md5").update(value).digest("hex");

interface Challenge {
  algorithm: string;
  nonce: string;
  opaque: string | null;
  qop: string | null;
  realm: string;
}

/**
 * Pulls the pieces out of a `WWW-Authenticate: Digest ...` header. Written as a
 * scan rather than one big regex because the parameter order is not fixed and
 * quoting is inconsistent between firmware versions.
 */
const parseChallenge = (header: string): Challenge | null => {
  /*
   * A device may offer more than one scheme, and `Headers.get` joins repeated
   * headers with ", " — so `Digest` can arrive after a `Basic` that we do not
   * want. Seek to the digest section rather than requiring it to come first.
   */
  const start = header.toLowerCase().indexOf("digest ");

  if (start === -1) {
    return null;
  }

  const digest = header.slice(start);
  const fields = new Map<string, string>();
  const pattern = /(\w+)=(?:"([^"]*)"|([^,\s]+))/g;
  let match = pattern.exec(digest);

  while (match) {
    const [, name, quoted, bare] = match;

    if (name) {
      fields.set(name.toLowerCase(), quoted ?? bare ?? "");
    }

    match = pattern.exec(digest);
  }

  const realm = fields.get("realm");
  const nonce = fields.get("nonce");

  if (!(realm && nonce)) {
    return null;
  }

  return {
    algorithm: fields.get("algorithm") ?? "MD5",
    nonce,
    opaque: fields.get("opaque") ?? null,
    qop: fields.get("qop") ?? null,
    realm,
  };
};

const authorizationHeader = (
  challenge: Challenge,
  target: DeviceTarget,
  method: string,
  uri: string,
  nonceCount: number
): string => {
  const cnonce = randomBytes(8).toString("hex");
  const nc = nonceCount.toString(16).padStart(8, "0");
  const ha1 = md5(`${target.username}:${challenge.realm}:${target.password}`);
  const ha2 = md5(`${method}:${uri}`);

  // `qop` is absent on some older firmware, where the response is the plain
  // three-part digest instead. Both forms are still in the wild.
  const qop = challenge.qop?.split(",")[0]?.trim() || null;
  const response = qop
    ? md5(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : md5(`${ha1}:${challenge.nonce}:${ha2}`);

  const parts = [
    `username="${target.username}"`,
    `realm="${challenge.realm}"`,
    `nonce="${challenge.nonce}"`,
    `uri="${uri}"`,
    `response="${response}"`,
  ];

  if (qop) {
    parts.push(`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
  }

  if (challenge.opaque) {
    parts.push(`opaque="${challenge.opaque}"`);
  }

  if (challenge.algorithm) {
    parts.push(`algorithm=${challenge.algorithm}`);
  }

  return `Digest ${parts.join(", ")}`;
};

/**
 * The cheapest authenticated endpoint on the box, used only to be told "401,
 * here is a nonce". It takes no body and changes nothing.
 */
const CHALLENGE_PATH = "/ISAPI/System/deviceInfo?format=json";

interface DeviceRequest {
  body?: BodyInit;
  contentType?: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  /** Milliseconds before giving up. A terminal on a bad wifi link is slow. */
  timeoutMs?: number;
}

/**
 * One authenticated ISAPI call. Returns the raw Response so callers can read it
 * as JSON, XML or bytes.
 */
const call = async (
  target: DeviceTarget,
  path: string,
  { body, contentType, method = "GET", timeoutMs = 8000 }: DeviceRequest = {}
): Promise<Response> => {
  const send = (options: {
    authorization?: string;
    body?: BodyInit;
    contentType?: string;
    method: string;
    path: string;
  }) => {
    const headers: Record<string, string> = {};

    if (options.authorization) {
      headers.Authorization = options.authorization;
    }

    if (options.contentType) {
      headers["Content-Type"] = options.contentType;
    }

    return fetch(`http://${target.host}:${target.port}${options.path}`, {
      body: options.body,
      headers,
      method: options.method,
      signal: AbortSignal.timeout(timeoutMs),
    });
  };

  const attempt = async (
    options: Parameters<typeof send>[0]
  ): Promise<Response> => {
    try {
      return await send(options);
    } catch (error) {
      // A refused connection or a DNS miss is the most common real failure and
      // deserves to say so, rather than surfacing as an opaque 500.
      throw new DeviceError(
        `Could not reach the terminal at ${target.host}:${target.port} — ${
          error instanceof Error ? error.message : "unknown error"
        }`
      );
    }
  };

  const real = (authorization?: string) =>
    attempt({ authorization, body, contentType, method, path });

  /*
   * Every call does its own handshake: a bodyless GET to collect a challenge,
   * then the real request signed with it. Two round trips on a LAN, always.
   *
   * There is no nonce cache, and the reason is boring rather than defensive.
   * This firmware accepts a reused nonce quite happily — a second request under
   * the same challenge, and even a repeated `nc`, are both answered normally —
   * so a cache would work. It would just have to detect a nonce the device has
   * finally retired and retry through it, and all that buys is one bodyless GET
   * on a LAN. Not worth the state.
   *
   * An earlier version of this comment blamed a stale nonce for the HTTP 400
   * `badJsonContent` that used to come back from the person endpoints. It was
   * wrong: that error is the device rejecting the *value* of `employeeNo`/`FPID`
   * — see `toDeviceEmployeeNo` below — and it reproduces just as reliably on a
   * fresh handshake. The transport was never the problem, and neither is the
   * bodyless probe: an unauthenticated request that carries a payload is
   * answered with an ordinary 401 and a challenge. The GET is bodyless because
   * there is no reason to put a payload on the wire twice.
   */
  const probe = await attempt({ method: "GET", path: CHALLENGE_PATH });

  if (probe.status !== 401) {
    // The device is not asking for credentials at all; just make the call.
    return await real();
  }

  const challenge = parseChallenge(probe.headers.get("www-authenticate") ?? "");

  if (!challenge) {
    throw new DeviceError(
      "The terminal refused the request and offered no digest challenge — check the username and password",
      401
    );
  }

  const signed = await real(
    authorizationHeader(challenge, target, method, path, 1)
  );

  if (signed.status === 401) {
    // A fresh challenge answered and still refused: now it really is the
    // credentials.
    throw new DeviceError(
      "The terminal rejected the username or password",
      401
    );
  }

  return signed;
};

/**
 * Pulls the leaf tags out of a flat ISAPI XML document into a plain record.
 *
 * `?format=json` is a request, not a promise: this firmware answers
 * `/ISAPI/System/deviceInfo` in XML whatever you ask for. The documents that
 * matter here are one level deep and made of scalars, so a tag scan gets every
 * field an XML parser would — and adding a parser dependency to read six strings
 * off a probe would be the wrong trade.
 */
const parseXmlFields = (xml: string): Record<string, string> => {
  const fields: Record<string, string> = {};
  const pattern = /<(\w+)(?:\s[^>]*)?>([^<]*)<\/\1>/g;
  let match = pattern.exec(xml);

  while (match) {
    const [, name, value] = match;

    if (name && value !== undefined && !(name in fields)) {
      fields[name] = value.trim();
    }

    match = pattern.exec(xml);
  }

  return fields;
};

const looksLikeXml = (text: string): boolean =>
  text.trimStart().startsWith("<");

/**
 * How the device says "you already enrolled this employeeNo". The wording is not
 * stable across firmware ("already exist", "employeeNo exist"), so this matches
 * the one word all of them share.
 */
const ALREADY_EXISTS = /exist/i;

/**
 * What went wrong, in the device's own words.
 *
 * Hikvision answers a *failure* with HTTP 200 and a `ResponseStatus` body more
 * often than with an error status, so a handler that only checks `response.ok`
 * will happily report success for a person it never created. Both encodings of
 * that body carry `statusCode`, where 1 means OK.
 */
const failureIn = (text: string): string | null => {
  if (text.trim() === "") {
    return null;
  }

  const fields = looksLikeXml(text)
    ? parseXmlFields(text)
    : (() => {
        try {
          const parsed = JSON.parse(text) as Record<string, unknown>;

          return Object.fromEntries(
            Object.entries(parsed).map(([key, value]) => [key, String(value)])
          );
        } catch {
          return {} as Record<string, string>;
        }
      })();

  const status = fields.statusCode;

  if (status === undefined || status === "1") {
    return null;
  }

  return (
    fields.errorMsg ??
    fields.subStatusCode ??
    fields.statusString ??
    `statusCode ${status}`
  );
};

/**
 * How much of a refusal to quote back.
 *
 * Generous on purpose. This firmware's `errorMsg` for a bad field is a static
 * three-clause blurb — "1. The message has only URL and no message body, 2. The
 * required node exists without parameters. 3. Exceeding the parameter range
 * limit: the parameter content of the node is wrong." — with **the name of the
 * offending node appended to the end**, e.g. `...is wrong.FPID`. That suffix is
 * the only part that says anything. Clipping at 200 characters cut it off and
 * left three sentences that all point at the body, which is how the wrong thing
 * got debugged for a week.
 */
const ERROR_EXCERPT = 400;

/** Reads a body as JSON, or as XML when the firmware ignores `format=json`. */
const readPayload = async (
  response: Response,
  what: string
): Promise<Record<string, unknown>> => {
  const text = await response.text();

  if (!response.ok) {
    throw new DeviceError(
      `The terminal refused ${what} (HTTP ${response.status}): ${text.slice(0, ERROR_EXCERPT)}`
    );
  }

  const failure = failureIn(text);

  if (failure) {
    throw new DeviceError(`The terminal refused ${what}: ${failure}`);
  }

  if (looksLikeXml(text)) {
    return parseXmlFields(text);
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new DeviceError(
      `The terminal answered ${what} with neither JSON nor XML: ${text.slice(0, ERROR_EXCERPT)}`
    );
  }
};

const assertOk = async (response: Response, what: string): Promise<void> => {
  const text = await response.text();

  if (!response.ok) {
    throw new DeviceError(
      `The terminal refused ${what} (HTTP ${response.status}): ${text.slice(0, ERROR_EXCERPT)}`
    );
  }

  const failure = failureIn(text);

  if (failure) {
    throw new DeviceError(`The terminal refused ${what}: ${failure}`);
  }
};

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};

const asString = (value: unknown): string | null =>
  typeof value === "string" && value !== "" ? value : null;

const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/**
 * The probe. Cheap, unauthenticated-safe to call repeatedly, and the one request
 * that answers "is this thing on the network and are the credentials right?".
 */
export const fetchDeviceInfo = async (
  target: DeviceTarget
): Promise<DeviceInfo> => {
  const payload = await readPayload(
    await call(target, "/ISAPI/System/deviceInfo?format=json"),
    "a device info request"
  );

  // XML arrives flat; JSON nests under `DeviceInfo`. Read the nested object when
  // there is one and the top level otherwise, so both shapes land here.
  const info = payload.DeviceInfo ? asRecord(payload.DeviceInfo) : payload;

  return {
    deviceName: asString(info.deviceName),
    firmwareVersion: asString(info.firmwareVersion),
    macAddress: asString(info.macAddress),
    model: asString(info.model),
    serialNumber: asString(info.serialNumber),
  };
};

/**
 * An `employeeNo` this firmware will actually accept: letters and digits only.
 *
 * This is the whole bug that made the person endpoints look broken. A body whose
 * `employeeNo`/`FPID` contains `-` or `_` comes back as **HTTP 400
 * `badJsonContent`**, whose message opens with "The message has only URL and no
 * message body" — so it reads like a transport or framing failure and is
 * nothing of the kind. The same request with an alphanumeric id, byte for byte
 * identical otherwise, returns 200. Proven on a DS-K1T342MX-E1 (V4.39.180):
 *
 * | `FPID`                 | result                          |
 * | ---------------------- | ------------------------------- |
 * | `abcdefgh` (not on it) | 200, `NO MATCH`                 |
 * | 32 alphanumerics       | 200, `NO MATCH`                 |
 * | `abc-defg`             | 400 `...node is wrong.FPID`     |
 * | `abc_defg`             | 400 `...node is wrong.FPID`     |
 * | 33 alphanumerics       | 400 `...node is wrong.FPID`     |
 *
 * Length is not the constraint (32 is fine, and `UserInfo/capabilities` reports
 * `employeeNo {@min:1,@max:32}`). Existence is not the constraint — an id the
 * device has never seen answers cleanly. The character set is.
 *
 * Our ids are `nanoid(20)`, and nanoid's default alphabet is `A-Za-z0-9_-`, so
 * about 47% of them carry a character this firmware refuses. Which is why the
 * failure looked intermittent and data-dependent: it was.
 */
const PLAIN_EMPLOYEE_NO = /^[A-Za-z0-9]{1,32}$/;

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const RADIX = 62n;
/** A byte, as a multiplier — the shifts this would be are lint-banned here. */
const BYTE = 256n;

/** `nanoid(20)`, per `ID_LENGTH`. Nothing wider has an encoding that fits 32. */
const MAX_SOURCE_BYTES = 20;

/**
 * The encoded width, and it is fixed rather than minimal on purpose: a constant
 * length is what makes decoding unambiguous. 29 base62 digits hold the 168 bits
 * of a 20-byte id plus its sentinel (62^28 < 2^168 < 62^29), and no id in this
 * system is 29 characters long, so a 29-character value arriving off the device
 * is one we put there.
 */
const ENCODED_LENGTH = 29;

/**
 * Our id as the terminal is willing to store it.
 *
 * Ids that are already alphanumeric go through untouched — most workers and
 * anyone enrolled by hand at the device's own admin menu — so this does not
 * orphan the records already on the box. Everything else is re-encoded into
 * base62, which is reversible, so `fromDeviceEmployeeNo` can turn a scan back
 * into a person without a lookup table and without a schema change:
 * `credentials.credential_value` keeps holding the person's own id.
 */
export const toDeviceEmployeeNo = (id: string): string => {
  if (PLAIN_EMPLOYEE_NO.test(id)) {
    return id;
  }

  const bytes = Buffer.from(id, "utf8");

  if (bytes.length === 0 || bytes.length > MAX_SOURCE_BYTES) {
    throw new DeviceError(
      `"${id}" cannot be an employeeNo — a terminal takes at most ${MAX_SOURCE_BYTES} characters`
    );
  }

  // The leading 1 is a sentinel. Without it a byte string and the same string
  // behind a NUL encode to the same number, and decoding could not tell where
  // the id starts — it is also what proves, on the way back, that a value is
  // one of ours.
  let value = 1n;

  for (const byte of bytes) {
    value = value * BYTE + BigInt(byte);
  }

  let encoded = "";

  for (let index = 0; index < ENCODED_LENGTH; index += 1) {
    encoded = BASE62.charAt(Number(value % RADIX)) + encoded;
    value /= RADIX;
  }

  return encoded;
};

/**
 * The person's own id, back from whatever the terminal reported.
 *
 * Anything that is not one of our encodings is returned unchanged: a scan of
 * somebody enrolled through the device's own menu is still a real scan, and it
 * is `resolveCredential` that decides whether the gym knows them.
 */
export const fromDeviceEmployeeNo = (employeeNo: string): string => {
  if (employeeNo.length !== ENCODED_LENGTH) {
    return employeeNo;
  }

  let value = 0n;

  for (const character of employeeNo) {
    const digit = BASE62.indexOf(character);

    if (digit === -1) {
      return employeeNo;
    }

    value = value * RADIX + BigInt(digit);
  }

  const bytes: number[] = [];

  while (value > 1n) {
    bytes.unshift(Number(value % BYTE));
    value /= BYTE;
  }

  // No sentinel means this is a 29-character id that merely looks like base62 —
  // somebody's own numbering, not our encoding of it.
  return value === 1n ? Buffer.from(bytes).toString("utf8") : employeeNo;
};

export interface EnrollPerson {
  /** Terminal-side id. Ours is the worker/member nanoid. */
  employeeNo: string;
  /** ISO-ish `YYYY-MM-DDTHH:mm:ss`; the device rejects a zone suffix. */
  endTime?: string;
  name: string;
  startTime?: string;
}

const localTimestamp = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;

/**
 * Creates the person on the terminal. Idempotent by intent: a device that
 * already knows this `employeeNo` answers with an error we treat as success, so
 * re-enrolling to replace a photo does not need a delete first.
 */
export const putPerson = async (
  target: DeviceTarget,
  person: EnrollPerson
): Promise<void> => {
  const begin = person.startTime ?? localTimestamp(new Date());
  // Far enough out to mean "no expiry" without using a sentinel the firmware
  // might reject. Memberships are enforced by us, not by the door.
  const end = person.endTime ?? "2037-12-31T23:59:59";

  const body = JSON.stringify({
    UserInfo: {
      Valid: {
        beginTime: begin,
        enable: true,
        endTime: end,
        timeType: "local",
      },
      doorRight: "1",
      employeeNo: toDeviceEmployeeNo(person.employeeNo),
      name: person.name,
      RightPlan: [{ doorNo: 1, planTemplateNo: "1" }],
      userType: "normal",
    },
  });

  const response = await call(
    target,
    "/ISAPI/AccessControl/UserInfo/Record?format=json",
    { body, contentType: "application/json", method: "POST" }
  );

  const text = await response.text();
  // A refusal usually arrives as HTTP 200 with a statusCode in the body, so the
  // status line alone cannot be trusted to mean the person was created.
  const failure = response.ok
    ? failureIn(text)
    : `HTTP ${response.status}: ${text.slice(0, 200)}`;

  if (!failure) {
    return;
  }

  if (!ALREADY_EXISTS.test(text)) {
    throw new DeviceError(`The terminal refused the person record: ${failure}`);
  }

  /*
   * "employeeNo is already exist" is success, not failure: this function exists
   * to guarantee the terminal knows this id, and it already does.
   *
   * A `Modify` follows only to refresh the name. It really does work — the
   * device answers `statusCode 1` for an `employeeNo` it holds, and the note
   * that once stood here claiming it always returns `badJsonContent` was reading
   * the symptom of an id the device had rejected on the way in. It stays
   * best-effort anyway, because a rename is cosmetic and letting one fail an
   * enrolment is how a member ends up unable to get through a door because their
   * surname changed.
   */
  await call(target, "/ISAPI/AccessControl/UserInfo/Modify?format=json", {
    body,
    contentType: "application/json",
    method: "PUT",
  }).catch(() => undefined);
};

export const deletePerson = async (
  target: DeviceTarget,
  employeeNo: string
): Promise<void> => {
  await assertOk(
    await call(target, "/ISAPI/AccessControl/UserInfo/Delete?format=json", {
      body: JSON.stringify({
        UserInfoDelCond: {
          EmployeeNoList: [{ employeeNo: toDeviceEmployeeNo(employeeNo) }],
        },
      }),
      contentType: "application/json",
      method: "PUT",
    }),
    "a person deletion"
  );
};

/**
 * Uploads the face. The picture goes to the device's own face library — we never
 * store or receive a face template, only the fact that one was enrolled.
 *
 * The device wants `multipart/form-data` with a JSON part naming the library and
 * the person, then the JPEG itself.
 */
export const putFace = async (
  target: DeviceTarget,
  employeeNo: string,
  picture: Uint8Array,
  contentType = "image/jpeg"
): Promise<void> => {
  const form = new FormData();

  form.append(
    "FaceDataRecord",
    JSON.stringify({
      faceLibType: "blackFD",
      FDID: "1",
      FPID: toDeviceEmployeeNo(employeeNo),
    })
  );
  form.append(
    "FaceImage",
    new Blob([picture as BlobPart], { type: contentType }),
    "face.jpg"
  );

  // No explicit Content-Type: FormData sets it with the boundary, and overriding
  // it produces a body the device cannot parse.
  await assertOk(
    await call(target, "/ISAPI/Intelligent/FDLib/FDSetUp?format=json", {
      body: form,
      method: "PUT",
      timeoutMs: 20_000,
    }),
    "a face upload"
  );
};

/** The bytes a JPEG starts and ends with, used to find one inside a multipart. */
const JPEG_SOI = [0xff, 0xd8, 0xff] as const;
const JPEG_EOI = [0xff, 0xd9] as const;

/**
 * The JPEG inside a response body, wherever it starts.
 *
 * The capture below answers with `multipart/form-data`, and this firmware writes
 * parts whose `Content-Disposition` carries no `name` — which `Response.formData`
 * rejects outright. Scanning for the image is both simpler and firmware-proof: it
 * also handles a bare `image/jpeg` body, which is what some builds send instead.
 */
const jpegWithin = (bytes: Uint8Array): Uint8Array | null => {
  for (let start = 0; start + JPEG_SOI.length <= bytes.length; start += 1) {
    if (
      bytes[start] !== JPEG_SOI[0] ||
      bytes[start + 1] !== JPEG_SOI[1] ||
      bytes[start + 2] !== JPEG_SOI[2]
    ) {
      continue;
    }

    for (let end = bytes.length - 1; end > start; end -= 1) {
      if (bytes[end] === JPEG_EOI[1] && bytes[end - 1] === JPEG_EOI[0]) {
        return bytes.subarray(start, end + 1);
      }
    }

    // No end marker: hand back the tail rather than nothing — a truncated JPEG
    // still tells the device more than an empty one, and it will say so.
    return bytes.subarray(start);
  }

  return null;
};

/**
 * The terminal waits about seventeen seconds for a face before giving up, so the
 * request has to outlive that by enough to carry the answer back.
 */
const CAPTURE_TIMEOUT_MS = 45_000;

/** What the device calls the "nobody stood there" refusal. */
const CAPTURE_TIMED_OUT = /captureTimeout/i;

/**
 * Takes a photo with the terminal's own camera, now, and hands back the JPEG.
 *
 * This is the enrolment path that actually works at a desk. The alternative —
 * arming a capture and harvesting the snapshot from a scan the device *refuses* —
 * only ever fires for a face the terminal does not already know, so it silently
 * does nothing for anybody enrolled under another id, which includes every
 * operator testing the feature on themselves. It also cannot replace a photo.
 * Asking the device to capture has none of those holes: it prompts the person on
 * its own screen, and the answer is the picture or a reason.
 *
 * The picture comes back inline (`dataType binary`) rather than as a URL on the
 * device, so there is no second authenticated fetch racing the device's own
 * cleanup of the file it just wrote.
 */
export const captureFaceAtDevice = async (
  target: DeviceTarget
): Promise<Uint8Array> => {
  const response = await call(target, "/ISAPI/AccessControl/CaptureFaceData", {
    body:
      "<CaptureFaceDataCond><captureInfrared>false</captureInfrared>" +
      "<dataType>binary</dataType></CaptureFaceDataCond>",
    contentType: "application/xml",
    method: "POST",
    timeoutMs: CAPTURE_TIMEOUT_MS,
  });

  const bytes = new Uint8Array(await response.arrayBuffer());
  const picture = jpegWithin(bytes);

  if (picture) {
    return picture;
  }

  // No image in the body: it is a refusal, and this firmware sends those as XML
  // with the real reason in `subStatusCode` (`errorMsg` says "cancelFlag" even
  // on a plain timeout, so it is the wrong field to quote).
  const text = Buffer.from(bytes).toString("utf8");

  if (CAPTURE_TIMED_OUT.test(text)) {
    throw new DeviceError(
      "The terminal waited and saw nobody — press capture again with the person standing in front of it"
    );
  }

  const fields = looksLikeXml(text) ? parseXmlFields(text) : {};

  throw new DeviceError(
    `The terminal could not capture a face: ${
      fields.subStatusCode ??
      fields.statusString ??
      text.slice(0, ERROR_EXCERPT)
    }`
  );
};

/**
 * Whether the terminal actually holds a face for this person.
 *
 * This is what makes "go and capture it at the device" a workable flow rather
 * than an instruction shouted into the void: the desk can ask, and get a real
 * answer, without walking over to look at the screen.
 *
 * It asks the *person* record rather than searching the face library, because
 * the record already carries the answer: `UserInfo/capabilities` advertises
 * `isSupportNumOfFace`, and every returned `UserInfo` has a `numOfFace`. Three
 * things follow, and all of them matter:
 *
 * - `FDLib/FDSearch` answers "there is no such person" and "that person has no
 *   face" with the identical `NO MATCH`. This tells them apart — an absent
 *   person means the enrolment never landed, which is a different thing to fix.
 * - A face-library hit returns the person's `modelData`, a base64 biometric
 *   template. This endpoint returns a count. No template need cross the wire to
 *   answer a yes/no question, so none does.
 * - It takes up to 30 ids per call, if a roster check is ever wanted.
 */
export const hasFaceOnDevice = async (
  target: DeviceTarget,
  employeeNo: string
): Promise<boolean> => {
  const payload = await readPayload(
    await call(target, "/ISAPI/AccessControl/UserInfo/Search?format=json", {
      body: JSON.stringify({
        UserInfoSearchCond: {
          EmployeeNoList: [{ employeeNo: toDeviceEmployeeNo(employeeNo) }],
          maxResults: 1,
          searchID: randomBytes(8).toString("hex"),
          searchResultPosition: 0,
        },
      }),
      contentType: "application/json",
      method: "POST",
      timeoutMs: 12_000,
    }),
    "a face check"
  );

  const result = asRecord(payload.UserInfoSearch);
  const [person] = Array.isArray(result.UserInfo) ? result.UserInfo : [];

  // No row at all is "the terminal does not know them", which for this question
  // is the same answer as "it knows them and has no photo".
  return (asNumber(asRecord(person).numOfFace) ?? 0) > 0;
};

/**
 * Makes the terminal attach the snapshot it took to the events it pushes.
 *
 * Off by default, and the default is silent: with `uploadCapPic` false the device
 * still pushes every scan, still sets `pictureURLType binary`, and simply never
 * includes a JPEG — so anything downstream waiting for one waits forever with no
 * error to show. That is exactly how the armed-capture path failed. Returns true
 * when it had to change something, so a caller can say whether it fixed anything.
 *
 * Read-then-write rather than a partial PUT: this endpoint takes the whole
 * `AcsCfg` object, and posting only the two flags resets everything else on it.
 */
export const ensureEventPictures = async (
  target: DeviceTarget
): Promise<boolean> => {
  const payload = await readPayload(
    await call(target, "/ISAPI/AccessControl/AcsCfg?format=json"),
    "the capture settings"
  );

  const current = asRecord(payload.AcsCfg);

  if (current.uploadCapPic === true && current.uploadVerificationPic === true) {
    return false;
  }

  await assertOk(
    await call(target, "/ISAPI/AccessControl/AcsCfg?format=json", {
      body: JSON.stringify({
        AcsCfg: {
          ...current,
          uploadCapPic: true,
          // The snapshot taken while verifying somebody, which is the one a
          // refused scan carries. Both flags, because which of the two a given
          // firmware attaches to a *failed* authentication is not documented.
          uploadVerificationPic: true,
        },
      }),
      contentType: "application/json",
      method: "PUT",
    }),
    "the capture settings"
  );

  return true;
};

/**
 * Points the terminal at us: from here on it POSTs every scan to `path` on
 * `host:port` and nothing has to poll it.
 *
 * XML only — the JSON form of this endpoint is not implemented on this firmware.
 */
export const configurePushHost = async (
  target: DeviceTarget,
  destination: { host: string; path: string; port: number }
): Promise<void> => {
  /*
   * `SubscribeEvent` is not optional dressing. Without it the device keeps a
   * destination but subscribes to nothing, so the host is configured and no
   * event ever arrives — the most confusing possible outcome.
   *
   * `pictureURLType` **must** be `binary`: it is what makes the terminal attach
   * the JPEG itself to the multipart push rather than a URL pointing back at the
   * device. Enrolling a face from a refused scan depends entirely on those bytes
   * being in the request.
   */
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<HttpHostNotificationList xmlns="http://www.isapi.org/ver20/XMLSchema">
  <HttpHostNotification>
    <id>1</id>
    <url>${destination.path}</url>
    <protocolType>HTTP</protocolType>
    <parameterFormatType>JSON</parameterFormatType>
    <addressingFormatType>ipaddress</addressingFormatType>
    <ipAddress>${destination.host}</ipAddress>
    <portNo>${destination.port}</portNo>
    <httpAuthenticationMethod>none</httpAuthenticationMethod>
    <SubscribeEvent>
      <heartbeat>30</heartbeat>
      <eventMode>all</eventMode>
      <EventList>
        <Event>
          <type>AccessControllerEvent</type>
          <minorAlarm></minorAlarm>
          <minorException></minorException>
          <minorOperation></minorOperation>
          <minorEvent></minorEvent>
          <pictureURLType>binary</pictureURLType>
        </Event>
      </EventList>
    </SubscribeEvent>
  </HttpHostNotification>
</HttpHostNotificationList>`;

  await assertOk(
    await call(target, "/ISAPI/Event/notification/httpHosts", {
      body,
      contentType: "application/xml",
      method: "PUT",
    }),
    "the event push configuration"
  );
};

/** Unlatches the door once — the "open for them" button at the desk. */
export const openDoor = async (target: DeviceTarget): Promise<void> => {
  await assertOk(
    await call(target, "/ISAPI/AccessControl/RemoteControl/door/1", {
      body: "<RemoteControlDoor><cmd>open</cmd></RemoteControlDoor>",
      contentType: "application/xml",
      method: "PUT",
    }),
    "the door open command"
  );
};

/**
 * Turns one raw `AccessControllerEvent` into our shape. Exported because the
 * push webhook and the pull below both receive the same object, just wrapped
 * differently — and because it is the piece most worth testing.
 *
 * This is the single point where a terminal-side `employeeNo` becomes a person's
 * own id again, which is what keeps `toDeviceEmployeeNo` confined to this file:
 * push and pull both land here, so nothing downstream ever sees the encoding.
 */
export const toTerminalEvent = (
  payload: unknown,
  fallbackTime: Date
): TerminalEvent | null => {
  const outer = asRecord(payload);
  const event = asRecord(
    outer.AccessControllerEvent ?? outer.accessControllerEvent ?? outer
  );

  const reported =
    asString(event.employeeNoString) ??
    (asNumber(event.employeeNo) === null
      ? null
      : String(asNumber(event.employeeNo)));

  const employeeNo = reported === null ? null : fromDeviceEmployeeNo(reported);

  const stamp = asString(outer.dateTime) ?? asString(event.time);
  const parsed = stamp ? new Date(stamp) : null;

  return {
    attendanceStatus: asString(event.attendanceStatus),
    cardNo: asString(event.cardNo),
    employeeNo,
    eventTime:
      parsed && !Number.isNaN(parsed.getTime()) ? parsed : fallbackTime,
    major: asNumber(event.majorEventType),
    minor: asNumber(event.subEventType) ?? asNumber(event.minorEventType),
    name: asString(event.name),
    serialNo: asNumber(event.serialNo),
  };
};

/**
 * Pulls events the device already holds. This is the recovery path: push is the
 * normal route, and this exists for the window where the server was down and the
 * terminal had nowhere to deliver.
 */
export const fetchEvents = async (
  target: DeviceTarget,
  range: { from: Date; to: Date },
  limit = 200
): Promise<TerminalEvent[]> => {
  const events: TerminalEvent[] = [];
  const searchId = randomBytes(8).toString("hex");
  let position = 0;

  while (events.length < limit) {
    const payload = await readPayload(
      await call(target, "/ISAPI/AccessControl/AcsEvent?format=json", {
        body: JSON.stringify({
          AcsEventCond: {
            endTime: localTimestamp(range.to),
            major: 5,
            maxResults: Math.min(30, limit - events.length),
            minor: 0,
            searchID: searchId,
            searchResultPosition: position,
            startTime: localTimestamp(range.from),
          },
        }),
        contentType: "application/json",
        method: "POST",
        timeoutMs: 15_000,
      }),
      "an event search"
    );

    const result = asRecord(payload.AcsEvent);
    const rows = Array.isArray(result.InfoList) ? result.InfoList : [];

    for (const row of rows) {
      const event = toTerminalEvent(row, range.to);

      if (event) {
        events.push(event);
      }
    }

    position += rows.length;

    // `MORE` means keep asking; anything else (including no rows) is the end.
    if (rows.length === 0 || asString(result.responseStatusStrg) !== "MORE") {
      break;
    }
  }

  return events;
};
