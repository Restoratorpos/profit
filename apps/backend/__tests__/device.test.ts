import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  captureFaceAtDevice,
  ensureEventPictures,
  fetchDeviceInfo,
  fromDeviceEmployeeNo,
  hasFaceOnDevice,
  putPerson,
  toDeviceEmployeeNo,
  toTerminalEvent,
} from "../src/lib/hikvision.js";

/**
 * The HTTP surface for terminals, and the parsing of what a terminal actually
 * sends. The services are mocked — they dial out to hardware — but the push
 * webhook is exercised for real, because "can the device reach it without a
 * service token?" is the question that decides whether any of this works.
 */
const deviceService = vi.hoisted(() => ({
  captureFaceFromEvent: vi.fn(),
  createDevice: vi.fn(),
  deleteDevice: vi.fn(),
  enablePush: vi.fn(),
  enrollPerson: vi.fn(),
  findDeviceByWebhookKey: vi.fn(),
  listDevices: vi.fn(),
  listEnrolled: vi.fn(),
  openDeviceDoor: vi.fn(),
  revokePerson: vi.fn(),
  syncEvents: vi.fn(),
  testDevice: vi.fn(),
  updateDevice: vi.fn(),
}));

const attendanceService = vi.hoisted(() => ({
  countOpenSessions: vi.fn(),
  ingestTerminalEvent: vi.fn(),
  listRecentEvents: vi.fn(),
}));

vi.mock("../src/services/device.service.js", () => deviceService);
vi.mock("../src/services/attendance.service.js", () => attendanceService);

const { app } = await import("../src/app.js");

const TOKEN = "test-service-token-at-least-16";
const GYM = "gym_00000000000000001";
const WORKER = "wrk_0000000000000001";
const KEY = "0123456789abcdef0123456789abcdef";
/** The device's own word for the failure, which the error must carry through. */
const INVALID_CONTENT = /invalidContent/;
const WRONG_PASSWORD = /rejected the username or password/;
const DIGEST_PREFIX = /^Digest /;
/**
 * The only alphabet a DS-K1T342MX-E1 accepts for an `employeeNo`/`FPID`. A `-`
 * or `_` is answered with HTTP 400 `badJsonContent`, whose message blames the
 * request body and means nothing of the kind.
 */
const DEVICE_SAFE_ID = /^[A-Za-z0-9]{1,32}$/;
/** A `nanoid(20)` that carries both characters the terminal refuses. */
const NANOID = "2Jm48_APNS9O-HyWSJIL";
const TOO_LONG_TO_ENCODE = /at most 20 characters/;
/** The field name the firmware appends to the *end* of a refusal message. */
const OFFENDING_NODE = /\.employeeNo/;
/** What a capture timeout has to read as by the time it reaches the desk. */
const NOBODY_THERE = /waited and saw nobody/;
const QUALITY_LOW = /captureQualityLow/;

const request = (
  path: string,
  init: RequestInit & { headers?: Record<string, string> } = {}
) =>
  app.request(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-gym-id": GYM,
      "x-service-token": TOKEN,
      "x-worker-id": WORKER,
      ...init.headers,
    },
  });

const post = (path: string, body: unknown) =>
  request(path, { body: JSON.stringify(body), method: "POST" });

/** A scan, in the shape a DS-K1T342MX pushes it. */
const pushBody = (overrides: Record<string, unknown> = {}) => ({
  dateTime: "2026-07-26T09:15:00+05:00",
  eventType: "AccessControllerEvent",
  ipAddress: "192.168.1.64",
  AccessControllerEvent: {
    attendanceStatus: "checkIn",
    cardReaderNo: 1,
    currentVerifyMode: "cardOrFaceOrFp",
    deviceName: "Access Controller",
    doorNo: 1,
    employeeNoString: WORKER,
    majorEventType: 5,
    serialNo: 4231,
    subEventType: 75,
    ...overrides,
  },
});

beforeEach(() => {
  for (const fn of Object.values(deviceService)) {
    fn.mockReset();
  }

  for (const fn of Object.values(attendanceService)) {
    fn.mockReset();
  }
});

describe("device routes", () => {
  it("refuses a request with no service token", async () => {
    const response = await app.request("/devices");

    expect(response.status).toBe(401);
    expect(deviceService.listDevices).not.toHaveBeenCalled();
  });

  it("passes the gym from the header straight to the service", async () => {
    deviceService.listDevices.mockResolvedValue([]);

    const response = await request("/devices");

    expect(response.status).toBe(200);
    expect(deviceService.listDevices).toHaveBeenCalledWith(GYM);
  });

  it("requires an address, a username and a password", async () => {
    const response = await post("/devices", { name: "Kirish" });

    expect(response.status).toBe(400);
    expect(deviceService.createDevice).not.toHaveBeenCalled();
  });

  it("defaults the port to 80 and the direction to both", async () => {
    deviceService.createDevice.mockResolvedValue({ id: "dev_1" });

    const response = await post("/devices", {
      ipAddress: "192.168.1.64",
      name: "Kirish",
      password: "Admin12345",
      username: "admin",
    });

    expect(response.status).toBe(201);
    expect(deviceService.createDevice).toHaveBeenCalledWith(
      GYM,
      expect.objectContaining({ direction: "both", port: 80 }),
      WORKER
    );
  });

  it("rejects a direction the ledger has no meaning for", async () => {
    const response = await post("/devices", {
      direction: "sideways",
      ipAddress: "192.168.1.64",
      name: "Kirish",
      password: "Admin12345",
      username: "admin",
    });

    expect(response.status).toBe(400);
  });

  it("carries the worker through to an enrollment", async () => {
    deviceService.enrollPerson.mockResolvedValue({ credentialId: "cred_1" });

    const response = await post("/devices/dev_1/people", {
      personId: WORKER,
      personType: "worker",
    });

    expect(response.status).toBe(201);
    expect(deviceService.enrollPerson).toHaveBeenCalledWith(
      GYM,
      "dev_1",
      { personId: WORKER, personType: "worker" },
      WORKER
    );
  });

  it("defaults a sync to the last 24 hours", async () => {
    deviceService.syncEvents.mockResolvedValue({
      ignored: 0,
      read: 0,
      recorded: 0,
    });

    await post("/devices/dev_1/sync", {});

    expect(deviceService.syncEvents).toHaveBeenCalledWith(GYM, "dev_1", {
      hours: 24,
    });
  });
});

describe("terminal push webhook", () => {
  it("accepts a scan with no service token — the terminal cannot send one", async () => {
    deviceService.findDeviceByWebhookKey.mockResolvedValue({
      branchId: "brn_1",
      deviceId: "dev_1",
      direction: "both",
      gymId: GYM,
      isActive: true,
    });
    attendanceService.ingestTerminalEvent.mockResolvedValue({
      direction: "in",
      name: "Owner",
      status: "recorded",
    });

    const response = await app.request(`/attendance/hik/${KEY}`, {
      body: JSON.stringify(pushBody()),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      direction: "in",
      name: "Owner",
      status: "recorded",
    });
    expect(attendanceService.ingestTerminalEvent).toHaveBeenCalledWith(
      GYM,
      expect.objectContaining({ deviceId: "dev_1" }),
      expect.objectContaining({ employeeNo: WORKER })
    );
  });

  it("reads the JSON part out of a multipart push", async () => {
    deviceService.findDeviceByWebhookKey.mockResolvedValue({
      branchId: null,
      deviceId: "dev_1",
      direction: "in",
      gymId: GYM,
      isActive: true,
    });
    attendanceService.ingestTerminalEvent.mockResolvedValue({
      direction: "in",
      name: "Owner",
      status: "recorded",
    });

    const form = new FormData();

    form.append("event_log", JSON.stringify(pushBody()));
    form.append(
      "Picture",
      new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }),
      "snap.jpg"
    );

    const response = await app.request(`/attendance/hik/${KEY}`, {
      body: form,
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(attendanceService.ingestTerminalEvent).toHaveBeenCalled();
  });

  it("enrols the snapshot from a refused scan when a capture is armed", async () => {
    /*
     * The terminal shows "authentication failed" — correctly, there is no face
     * on file — and pushes the photo it just took. That photo is the enrolment.
     */
    deviceService.findDeviceByWebhookKey.mockResolvedValue({
      branchId: null,
      deviceId: "dev_1",
      direction: "both",
      gymId: GYM,
      isActive: true,
    });
    deviceService.captureFaceFromEvent.mockResolvedValue({
      personId: "mem_1",
    });

    const form = new FormData();

    form.append(
      "event_log",
      JSON.stringify(pushBody({ employeeNoString: "" }))
    );
    form.append(
      "Picture",
      new Blob([new Uint8Array([255, 216, 255])], { type: "image/jpeg" }),
      "snap.jpg"
    );

    const response = await app.request(`/attendance/hik/${KEY}`, {
      body: form,
      method: "POST",
    });

    expect(await response.json()).toEqual({ status: "captured" });
    expect(deviceService.captureFaceFromEvent).toHaveBeenCalledWith(
      GYM,
      expect.any(Uint8Array),
      null
    );
    // A capture is not attendance: nobody was let in.
    expect(attendanceService.ingestTerminalEvent).not.toHaveBeenCalled();
  });

  it("treats an unrecognised face as a stranger when nothing is armed", async () => {
    deviceService.findDeviceByWebhookKey.mockResolvedValue({
      branchId: null,
      deviceId: "dev_1",
      direction: "both",
      gymId: GYM,
      isActive: true,
    });
    deviceService.captureFaceFromEvent.mockResolvedValue(null);
    attendanceService.ingestTerminalEvent.mockResolvedValue({
      reason: "unknown_credential",
      status: "ignored",
    });

    const form = new FormData();

    form.append(
      "event_log",
      JSON.stringify(pushBody({ employeeNoString: "" }))
    );
    form.append(
      "Picture",
      new Blob([new Uint8Array([255, 216, 255])], { type: "image/jpeg" }),
      "snap.jpg"
    );

    const response = await app.request(`/attendance/hik/${KEY}`, {
      body: form,
      method: "POST",
    });

    expect(await response.json()).toEqual({
      reason: "unknown_credential",
      status: "ignored",
    });
  });

  it("swallows an unknown key rather than telling a prober it guessed wrong", async () => {
    deviceService.findDeviceByWebhookKey.mockResolvedValue(null);

    const response = await app.request("/attendance/hik/not-a-real-key", {
      body: JSON.stringify(pushBody()),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ignored" });
    expect(attendanceService.ingestTerminalEvent).not.toHaveBeenCalled();
  });

  it("ignores a push to a disabled terminal", async () => {
    deviceService.findDeviceByWebhookKey.mockResolvedValue({
      branchId: null,
      deviceId: "dev_1",
      direction: "both",
      gymId: GYM,
      isActive: false,
    });

    const response = await app.request(`/attendance/hik/${KEY}`, {
      body: JSON.stringify(pushBody()),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(attendanceService.ingestTerminalEvent).not.toHaveBeenCalled();
  });

  it("still protects the attendance reads", async () => {
    const response = await app.request("/attendance/events");

    expect(response.status).toBe(401);
    expect(attendanceService.listRecentEvents).not.toHaveBeenCalled();
  });
});

describe("fetchDeviceInfo", () => {
  const target = {
    host: "192.168.1.113",
    password: "secret",
    port: 80,
    username: "admin",
  };

  const respond = (body: string, init: ResponseInit = {}) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(body, { status: 200, ...init })))
    );
  };

  // The stub is global; leaving it in place would silently answer every other
  // suite's requests too.
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * The real answer from a DS-K1T342MX-E1 on 2026-07-26. It ignores
   * `?format=json` entirely — which is exactly the case that broke the first
   * connection test, so it is pinned here verbatim.
   */
  const REAL_XML = `<?xml version="1.0" encoding="UTF-8"?>
<DeviceInfo version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">
<deviceName>Access Controller</deviceName>
<deviceID>255</deviceID>
<model>DS-K1T342MX-E1</model>
<serialNumber>DS-K1T342MX-E120250101AAWRJ12345678</serialNumber>
<macAddress>bc:5e:33:11:22:33</macAddress>
<firmwareVersion>V3.2.60</firmwareVersion>
</DeviceInfo>`;

  it("reads the XML this firmware answers with despite format=json", async () => {
    respond(REAL_XML);

    const info = await fetchDeviceInfo(target);

    expect(info.model).toBe("DS-K1T342MX-E1");
    expect(info.deviceName).toBe("Access Controller");
    expect(info.firmwareVersion).toBe("V3.2.60");
    expect(info.serialNumber).toBe("DS-K1T342MX-E120250101AAWRJ12345678");
  });

  it("still reads the nested JSON shape, for firmware that honours the flag", async () => {
    respond(
      JSON.stringify({
        DeviceInfo: {
          deviceName: "Access Controller",
          model: "DS-K1T342MX-E1",
        },
      })
    );

    const info = await fetchDeviceInfo(target);

    expect(info.model).toBe("DS-K1T342MX-E1");
  });

  it("treats an HTTP 200 carrying a failure statusCode as a failure", async () => {
    respond(
      "<ResponseStatus><statusCode>6</statusCode><subStatusCode>invalidContent</subStatusCode></ResponseStatus>"
    );

    await expect(fetchDeviceInfo(target)).rejects.toThrow(INVALID_CONTENT);
  });
});

describe("digest auth", () => {
  const target = {
    host: "192.168.1.113",
    password: "secret",
    port: 80,
    username: "admin",
  };

  const CHALLENGE =
    'Digest qop="auth", realm="IP Camera(K1234)", nonce="4e5a3b2c1d"';

  const OK_XML = "<DeviceInfo><model>DS-K1T342MX-E1</model></DeviceInfo>";

  const unauthorized = (headers: Record<string, string> = {}) =>
    new Response("", { headers, status: 401 });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Answers each call in turn, so a whole handshake can be described. */
  const respondInOrder = (responses: Response[]) => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(responses.shift() ?? new Response("", { status: 500 }))
    );

    vi.stubGlobal("fetch", fetchMock);

    return fetchMock;
  };

  it("collects the challenge from a 401 and retries signed", async () => {
    const fetchMock = respondInOrder([
      unauthorized({ "www-authenticate": CHALLENGE }),
      new Response(OK_XML, { status: 200 }),
    ]);

    const info = await fetchDeviceInfo({ ...target, host: "10.0.0.1" });

    expect(info.model).toBe("DS-K1T342MX-E1");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [, signed] = fetchMock.mock.calls;
    const headers = (signed?.[1] as RequestInit).headers as Record<
      string,
      string
    >;

    expect(headers.Authorization).toMatch(DIGEST_PREFIX);
    expect(headers.Authorization).toContain('realm="IP Camera(K1234)"');
  });

  it("finds the digest challenge behind another offered scheme", async () => {
    respondInOrder([
      unauthorized({ "www-authenticate": `Basic realm="x", ${CHALLENGE}` }),
      new Response(OK_XML, { status: 200 }),
    ]);

    const info = await fetchDeviceInfo({ ...target, host: "10.0.0.2" });

    expect(info.model).toBe("DS-K1T342MX-E1");
  });

  it("handshakes afresh on every call, never reusing a nonce", async () => {
    /*
     * There is no nonce cache. The device would tolerate one — it answers a
     * reused nonce and even a repeated `nc` normally — but a cache would have to
     * notice one it has finally retired, and all that saves is a bodyless GET on
     * a LAN.
     */
    const host = "10.0.0.3";

    respondInOrder([
      unauthorized({ "www-authenticate": CHALLENGE }),
      new Response(OK_XML, { status: 200 }),
    ]);
    await fetchDeviceInfo({ ...target, host });

    const fetchMock = respondInOrder([
      unauthorized({ "www-authenticate": CHALLENGE }),
      new Response(OK_XML, { status: 200 }),
    ]);

    const info = await fetchDeviceInfo({ ...target, host });

    expect(info.model).toBe("DS-K1T342MX-E1");
    // Probe and signed request — the second call does not try a stored nonce.
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [probe] = fetchMock.mock.calls;

    expect(
      (probe?.[1] as RequestInit | undefined)?.headers as Record<string, string>
    ).not.toHaveProperty("Authorization");
  });

  it("never sends a request body unauthenticated", async () => {
    /*
     * The payload goes on the wire once, signed. The device would answer an
     * unauthenticated request carrying one with an ordinary 401 and a challenge,
     * so this is tidiness rather than a workaround — but it is the shape the
     * digest flow is written to and worth pinning.
     */
    const fetchMock = respondInOrder([
      unauthorized({ "www-authenticate": CHALLENGE }),
      new Response(JSON.stringify({ statusCode: 1, statusString: "OK" }), {
        status: 200,
      }),
    ]);

    await putPerson(
      { ...target, host: "10.0.0.5" },
      { employeeNo: "mem_1", name: "Sherali" }
    );

    const [probe, signed] = fetchMock.mock.calls;
    const probeInit = probe?.[1] as RequestInit;
    const signedInit = signed?.[1] as RequestInit;

    expect(probeInit.body).toBeUndefined();
    expect(probeInit.method).toBe("GET");
    expect(signedInit.body).toBeTruthy();
    expect(
      (signedInit.headers as Record<string, string>).Authorization
    ).toMatch(DIGEST_PREFIX);
  });

  it("treats an already-enrolled employeeNo as success", async () => {
    /*
     * The point of putPerson is that the terminal knows this id. If it already
     * does, that is the goal met — and the `Modify` that follows only refreshes
     * the name, so it is best-effort: a rename is cosmetic, and letting one fail
     * would leave a member unable to get through a door because their surname
     * changed.
     */
    respondInOrder([
      unauthorized({ "www-authenticate": CHALLENGE }),
      new Response(
        JSON.stringify({
          errorMsg: "employeeNo is already exist",
          statusCode: 6,
          subStatusCode: "employeeNoAlreadyExist",
        }),
        { status: 200 }
      ),
      unauthorized({ "www-authenticate": CHALLENGE }),
      new Response(
        JSON.stringify({
          errorMsg: "JSON message error",
          statusCode: 6,
          subStatusCode: "badJsonContent",
        }),
        { status: 400 }
      ),
    ]);

    await expect(
      putPerson(
        { ...target, host: "10.0.0.6" },
        { employeeNo: "mem_1", name: "Sherali" }
      )
    ).resolves.toBeUndefined();
  });

  it("still reports a genuinely wrong password", async () => {
    respondInOrder([
      unauthorized({ "www-authenticate": CHALLENGE }),
      unauthorized({ "www-authenticate": CHALLENGE }),
    ]);

    await expect(
      fetchDeviceInfo({ ...target, host: "10.0.0.4" })
    ).rejects.toThrow(WRONG_PASSWORD);
  });
});

describe("employeeNo encoding", () => {
  it("leaves an id the terminal already accepts alone", () => {
    // The people enrolled by hand at the device's own menu keep their ids, so
    // this does not orphan the records already on the box.
    expect(toDeviceEmployeeNo("912a2d18")).toBe("912a2d18");
    expect(toDeviceEmployeeNo("gdrpxODxMzuQydGGKhoD")).toBe(
      "gdrpxODxMzuQydGGKhoD"
    );
  });

  it("makes a nanoid carrying - or _ device-safe", () => {
    // These exact ids are in the members table and every one of them was
    // refused with HTTP 400 badJsonContent before this encoding existed.
    for (const id of [
      NANOID,
      "d3JVLDCQ_oNY6jNoDs-B",
      "ET-4Va6TTxGnN_a4CLqz",
      WORKER,
    ]) {
      expect(toDeviceEmployeeNo(id)).toMatch(DEVICE_SAFE_ID);
    }
  });

  it("round-trips, so a scan still names the person who made it", () => {
    for (const id of [NANOID, WORKER, "912a2d18", "mem_1"]) {
      expect(fromDeviceEmployeeNo(toDeviceEmployeeNo(id))).toBe(id);
    }
  });

  it("encodes distinct ids distinctly", () => {
    const encoded = new Set(
      [NANOID, "d3JVLDCQ_oNY6jNoDs-B", "ET-4Va6TTxGnN_a4CLqz"].map(
        toDeviceEmployeeNo
      )
    );

    expect(encoded.size).toBe(3);
  });

  it("hands back an id it did not encode, rather than mangling it", () => {
    // Somebody's own numbering at the device menu is still a real scan; whether
    // the gym knows them is resolveCredential's decision, not this function's.
    expect(fromDeviceEmployeeNo("912a2d18")).toBe("912a2d18");
    expect(fromDeviceEmployeeNo("00000000000000000000000000000")).toBe(
      "00000000000000000000000000000"
    );
  });

  it("refuses an id no encoding could fit in 32 characters", () => {
    expect(() => toDeviceEmployeeNo("a-very-long-identifier-indeed")).toThrow(
      TOO_LONG_TO_ENCODE
    );
  });
});

describe("person endpoints", () => {
  const target = {
    host: "192.168.1.113",
    password: "secret",
    port: 80,
    username: "admin",
  };

  const CHALLENGE =
    'Digest qop="auth", realm="IP Camera(K1234)", nonce="4e5a3b2c1d"';

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const respondInOrder = (responses: Response[]) => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(responses.shift() ?? new Response("", { status: 500 }))
    );

    vi.stubGlobal("fetch", fetchMock);

    return fetchMock;
  };

  const ok = (payload: unknown) =>
    new Response(JSON.stringify(payload), { status: 200 });

  const challenged = () =>
    new Response("", {
      headers: { "www-authenticate": CHALLENGE },
      status: 401,
    });

  /** What actually went out on the signed request. */
  const sentBody = (call: unknown): Record<string, unknown> =>
    JSON.parse(String((call as RequestInit).body)) as Record<string, unknown>;

  it("never puts a - or _ in the employeeNo it enrols", async () => {
    const fetchMock = respondInOrder([
      challenged(),
      ok({ statusCode: 1, statusString: "OK" }),
    ]);

    await putPerson(
      { ...target, host: "10.0.1.1" },
      { employeeNo: NANOID, name: "Sherali" }
    );

    const [, signed] = fetchMock.mock.calls;
    const user = sentBody(signed?.[1]).UserInfo as Record<string, unknown>;

    expect(user.employeeNo).toMatch(DEVICE_SAFE_ID);
    expect(user.employeeNo).not.toBe(NANOID);
    // The name is ours to send verbatim; only the id is constrained.
    expect(user.name).toBe("Sherali");
  });

  it("asks the person record for the face, not the face library", async () => {
    /*
     * FDLib/FDSearch answers "no such person" and "person with no face" with the
     * same NO MATCH, and hands back a base64 biometric template on a hit.
     * UserInfo/Search answers both questions with a count and no template.
     */
    const fetchMock = respondInOrder([
      challenged(),
      ok({
        UserInfoSearch: {
          numOfMatches: 1,
          responseStatusStrg: "OK",
          totalMatches: 1,
          UserInfo: [{ employeeNo: "912a2d18", name: "Sherali", numOfFace: 1 }],
        },
      }),
    ]);

    await expect(
      hasFaceOnDevice({ ...target, host: "10.0.1.2" }, NANOID)
    ).resolves.toBe(true);

    const [, signed] = fetchMock.mock.calls;

    expect(String(signed?.[0])).toContain(
      "/ISAPI/AccessControl/UserInfo/Search"
    );

    const condition = sentBody(signed?.[1]).UserInfoSearchCond as Record<
      string,
      unknown
    >;
    const [asked] = condition.EmployeeNoList as { employeeNo: string }[];

    expect(asked?.employeeNo).toMatch(DEVICE_SAFE_ID);
  });

  it("reports no face for a person the terminal knows but has no photo of", async () => {
    respondInOrder([
      challenged(),
      ok({
        UserInfoSearch: {
          numOfMatches: 1,
          responseStatusStrg: "OK",
          totalMatches: 1,
          UserInfo: [{ employeeNo: "add7c0c2", name: "test 2", numOfFace: 0 }],
        },
      }),
    ]);

    await expect(
      hasFaceOnDevice({ ...target, host: "10.0.1.3" }, "add7c0c2")
    ).resolves.toBe(false);
  });

  it("reports no face for a person the terminal has never heard of", async () => {
    respondInOrder([
      challenged(),
      ok({
        UserInfoSearch: {
          numOfMatches: 0,
          responseStatusStrg: "NO MATCH",
          totalMatches: 0,
        },
      }),
    ]);

    await expect(
      hasFaceOnDevice({ ...target, host: "10.0.1.4" }, NANOID)
    ).resolves.toBe(false);
  });

  it("quotes far enough into a refusal to reach the node it names", async () => {
    /*
     * The firmware's errorMsg is a fixed three-clause blurb with the offending
     * field appended to the *end*. Clipping it short leaves three sentences that
     * all point at the request body and hides the one word that is true.
     */
    const errorMsg =
      "JSON message error: 1. The message has only URL and no message body, 2. The required node exists without parameters. 3. Exceeding the parameter range limit: the parameter content of the node is wrong, and the message goes on at some length before it finally names the field.employeeNo";

    respondInOrder([
      challenged(),
      new Response(
        JSON.stringify({
          errorCode: 1_610_612_759,
          errorMsg,
          statusCode: 6,
          subStatusCode: "badJsonContent",
        }),
        { status: 400 }
      ),
    ]);

    await expect(
      hasFaceOnDevice({ ...target, host: "10.0.1.5" }, "912a2d18")
    ).rejects.toThrow(OFFENDING_NODE);
  });
});

describe("captureFaceAtDevice", () => {
  const target = {
    host: "192.168.1.113",
    password: "secret",
    port: 80,
    username: "admin",
  };

  const CHALLENGE =
    'Digest qop="auth", realm="IP Camera(K1234)", nonce="4e5a3b2c1d"';

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const respondInOrder = (responses: Response[]) => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(responses.shift() ?? new Response("", { status: 500 }))
    );

    vi.stubGlobal("fetch", fetchMock);

    return fetchMock;
  };

  const challenged = () =>
    new Response("", {
      headers: { "www-authenticate": CHALLENGE },
      status: 401,
    });

  /** A JPEG, as far as anything downstream can tell: SOI, payload, EOI. */
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x2a, 0x2b, 0xff, 0xd9]);

  /**
   * The multipart a successful capture comes back as. The image part carries no
   * `name=`, which is why this is scanned for a JPEG rather than handed to
   * `Response.formData()` — that rejects a nameless part outright.
   */
  const multipart = (): Response => {
    const boundary = "MIME_boundary";
    const head = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="CaptureFaceData"\r\nContent-Type: application/json\r\n\r\n{"captureProgress":100}\r\n--${boundary}\r\nContent-Disposition: form-data; filename="face.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`
    );
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`);

    return new Response(Buffer.concat([head, Buffer.from(JPEG), tail]), {
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      status: 200,
    });
  };

  /** Verbatim from a DS-K1T342MX-E1 with nobody in front of it, 2026-07-26. */
  const CAPTURE_TIMEOUT = `<?xml version="1.0" encoding="UTF-8"?>
<ResponseStatus version="1.0" xmlns="http://www.hikvision.com/ver10/XMLSchema">
<requestURL></requestURL>
<statusCode>3</statusCode>
<statusString>Device Error</statusString>
<subStatusCode>captureTimeout</subStatusCode>
<errorCode>805330944</errorCode>
<errorMsg>cancelFlag</errorMsg>
</ResponseStatus>`;

  it("pulls the JPEG out of the multipart the device answers with", async () => {
    const fetchMock = respondInOrder([challenged(), multipart()]);

    const picture = await captureFaceAtDevice({ ...target, host: "10.0.2.1" });

    expect(Array.from(picture)).toEqual(Array.from(JPEG));

    const [, signed] = fetchMock.mock.calls;

    expect(String(signed?.[0])).toContain(
      "/ISAPI/AccessControl/CaptureFaceData"
    );
    // Inline bytes, not a URL on the device that a second fetch has to race.
    expect(String((signed?.[1] as RequestInit).body)).toContain(
      "<dataType>binary</dataType>"
    );
  });

  it("takes a bare image body, for firmware that sends one", async () => {
    respondInOrder([
      challenged(),
      new Response(Buffer.from(JPEG), {
        headers: { "content-type": "image/jpeg" },
        status: 200,
      }),
    ]);

    const picture = await captureFaceAtDevice({ ...target, host: "10.0.2.2" });

    expect(Array.from(picture)).toEqual(Array.from(JPEG));
  });

  it("says nobody stood there, rather than quoting cancelFlag at the desk", async () => {
    /*
     * The device reports a plain timeout with `errorMsg: cancelFlag`, which reads
     * like somebody pressed cancel and means nothing of the kind. The
     * subStatusCode is the field that tells the truth.
     */
    respondInOrder([
      challenged(),
      new Response(CAPTURE_TIMEOUT, {
        headers: { "content-type": "application/xml" },
        status: 400,
      }),
    ]);

    await expect(
      captureFaceAtDevice({ ...target, host: "10.0.2.3" })
    ).rejects.toThrow(NOBODY_THERE);
  });

  it("carries any other refusal through by its own subStatusCode", async () => {
    respondInOrder([
      challenged(),
      new Response(
        "<ResponseStatus><statusCode>3</statusCode><subStatusCode>captureQualityLow</subStatusCode></ResponseStatus>",
        { status: 400 }
      ),
    ]);

    await expect(
      captureFaceAtDevice({ ...target, host: "10.0.2.4" })
    ).rejects.toThrow(QUALITY_LOW);
  });
});

describe("ensureEventPictures", () => {
  const target = {
    host: "192.168.1.113",
    password: "secret",
    port: 80,
    username: "admin",
  };

  const CHALLENGE =
    'Digest qop="auth", realm="IP Camera(K1234)", nonce="4e5a3b2c1d"';

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const respondInOrder = (responses: Response[]) => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(responses.shift() ?? new Response("", { status: 500 }))
    );

    vi.stubGlobal("fetch", fetchMock);

    return fetchMock;
  };

  const challenged = () =>
    new Response("", {
      headers: { "www-authenticate": CHALLENGE },
      status: 401,
    });

  /** The shipping default: pushes arrive, and never carry a photo. */
  const acsCfg = (overrides: Record<string, unknown> = {}) =>
    new Response(
      JSON.stringify({
        AcsCfg: {
          showName: true,
          uploadCapPic: false,
          uploadVerificationPic: false,
          voicePrompt: true,
          ...overrides,
        },
      }),
      { status: 200 }
    );

  it("turns both picture flags on without disturbing the rest of the config", async () => {
    const fetchMock = respondInOrder([
      challenged(),
      acsCfg(),
      challenged(),
      new Response(JSON.stringify({ statusCode: 1 }), { status: 200 }),
    ]);

    await expect(
      ensureEventPictures({ ...target, host: "10.0.3.1" })
    ).resolves.toBe(true);

    const written = JSON.parse(
      String((fetchMock.mock.calls.at(-1)?.[1] as RequestInit).body)
    ) as { AcsCfg: Record<string, unknown> };

    expect(written.AcsCfg.uploadCapPic).toBe(true);
    expect(written.AcsCfg.uploadVerificationPic).toBe(true);
    // A partial PUT resets everything it omits, so the rest has to come along.
    expect(written.AcsCfg.voicePrompt).toBe(true);
    expect(written.AcsCfg.showName).toBe(true);
  });

  it("writes nothing when the terminal already sends pictures", async () => {
    const fetchMock = respondInOrder([
      challenged(),
      acsCfg({ uploadCapPic: true, uploadVerificationPic: true }),
    ]);

    await expect(
      ensureEventPictures({ ...target, host: "10.0.3.2" })
    ).resolves.toBe(false);
    // Probe and read only: no PUT.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("toTerminalEvent", () => {
  it("pulls the employee, the time and the intent out of a push", () => {
    const event = toTerminalEvent(pushBody(), new Date("2026-01-01T00:00:00Z"));

    expect(event?.employeeNo).toBe(WORKER);
    expect(event?.attendanceStatus).toBe("checkIn");
    expect(event?.major).toBe(5);
    expect(event?.minor).toBe(75);
    expect(event?.eventTime.toISOString()).toBe("2026-07-26T04:15:00.000Z");
  });

  it("falls back to now when the device sends no usable timestamp", () => {
    const fallback = new Date("2026-01-01T00:00:00Z");
    const event = toTerminalEvent(
      { ...pushBody(), dateTime: "not a date" },
      fallback
    );

    expect(event?.eventTime).toEqual(fallback);
  });

  it("reports no employee for a stranger, so it never becomes attendance", () => {
    const event = toTerminalEvent(
      pushBody({ employeeNoString: "" }),
      new Date()
    );

    expect(event?.employeeNo).toBeNull();
  });

  it("reads a numeric employeeNo from firmware that sends one", () => {
    const event = toTerminalEvent(
      pushBody({ employeeNo: 4207, employeeNoString: "" }),
      new Date()
    );

    expect(event?.employeeNo).toBe("4207");
  });

  it("turns the terminal's spelling of an id back into the person's own", () => {
    /*
     * The scan comes back carrying whatever was enrolled, which for a nanoid
     * with a - or _ in it is the encoded form. Decoding here is what lets
     * `credentials.credential_value` go on holding the person's own id.
     */
    const event = toTerminalEvent(
      pushBody({ employeeNoString: toDeviceEmployeeNo(NANOID) }),
      new Date()
    );

    expect(event?.employeeNo).toBe(NANOID);
  });

  it("leaves an id it did not encode exactly as the terminal reported it", () => {
    const event = toTerminalEvent(
      pushBody({ employeeNoString: "912a2d18" }),
      new Date()
    );

    expect(event?.employeeNo).toBe("912a2d18");
  });

  it("reads an event given bare, as the pull endpoint returns them", () => {
    const event = toTerminalEvent(
      {
        employeeNoString: WORKER,
        majorEventType: 5,
        subEventType: 75,
        time: "2026-07-26T09:15:00+05:00",
      },
      new Date()
    );

    expect(event?.employeeNo).toBe(WORKER);
    expect(event?.eventTime.toISOString()).toBe("2026-07-26T04:15:00.000Z");
  });
});
