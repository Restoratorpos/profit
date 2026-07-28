import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The service is mocked: these tests cover the HTTP surface — service-token
 * auth, validation, status codes, and that the tenant and operator from the
 * headers reach the service.
 */
const service = vi.hoisted(() => ({
  listWorkers: vi.fn(),
  createWorker: vi.fn(),
  updateWorker: vi.fn(),
  setWorkerActive: vi.fn(),
  getWorkerDetail: vi.fn(),
  getWorkerPayroll: vi.fn(),
  payWorker: vi.fn(),
  checkIn: vi.fn(),
  checkOut: vi.fn(),
  // The route imports these range helpers from the same module.
  rangeFromQuery: vi.fn(() => ({ from: new Date(0), to: new Date(1) })),
}));

/**
 * Face enrolment reaches out to the terminals over the LAN, so it is mocked for
 * the same reason the rest is: these tests are about the HTTP surface. What they
 * do assert is the argument that matters — every one of these must be called
 * with "worker", not "member", or staff would be enrolled into the wrong half of
 * the credentials table and never resolve at the door.
 */
const faces = vi.hoisted(() => ({
  armFaceCapture: vi.fn(),
  captureFaceAtTerminal: vi.fn(),
  disarmFaceCapture: vi.fn(),
  enrollFaceEverywhere: vi.fn(),
  revokeFaceEverywhere: vi.fn(),
  syncFaceStatus: vi.fn(),
}));

vi.mock("../src/services/worker.service.js", () => service);
vi.mock("../src/services/device.service.js", () => faces);

const { app } = await import("../src/app.js");

const TOKEN = "test-service-token-at-least-16";
const GYM = "gym_00000000000000001";
const WORKER = "wrk_00000000000000001";

const request = (
  path: string,
  init: RequestInit & { headers?: Record<string, string> } = {}
) =>
  app.request(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-service-token": TOKEN,
      "x-gym-id": GYM,
      "x-worker-id": WORKER,
      ...init.headers,
    },
  });

const validWorker = {
  fullname: "Test Trainer",
  phone: "998901112233",
  role: "trainer",
  salaryType: "hourly",
  salaryAmount: "32000",
  shiftStart: "09:00",
  shiftEnd: "18:00",
  workingDays: [1, 2, 3, 4, 5],
};

beforeEach(() => {
  service.listWorkers.mockReset();
  service.createWorker.mockReset();
  service.updateWorker.mockReset();
  service.setWorkerActive.mockReset();
  service.getWorkerDetail.mockReset();
  service.getWorkerPayroll.mockReset();
  service.payWorker.mockReset();
  service.checkIn.mockReset();
  service.checkOut.mockReset();

  for (const fn of Object.values(faces)) {
    fn.mockReset();
  }
});

describe("worker face enrolment", () => {
  const FACE = `/workers/${WORKER}/face`;

  it("registers the worker on every terminal and reports each one", async () => {
    faces.syncFaceStatus.mockResolvedValue([
      { error: null, hasFace: false, id: "dev_1", name: "MAIN" },
    ]);

    const response = await request(`${FACE}/sync`, { method: "POST" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      { error: null, hasFace: false, id: "dev_1", name: "MAIN" },
    ]);
    expect(faces.syncFaceStatus).toHaveBeenCalledWith(
      GYM,
      "worker",
      WORKER,
      WORKER
    );
  });

  it("captures at the terminal the person is standing at", async () => {
    faces.captureFaceAtTerminal.mockResolvedValue({ enrolled: 1, failed: [] });

    const response = await request(`${FACE}/capture/dev_1`, {
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(faces.captureFaceAtTerminal).toHaveBeenCalledWith(
      GYM,
      "worker",
      WORKER,
      "dev_1",
      WORKER
    );
  });

  it("accepts an uploaded photo for somebody not in the building", async () => {
    faces.enrollFaceEverywhere.mockResolvedValue({ enrolled: 1, failed: [] });

    const response = await request(FACE, {
      body: JSON.stringify({ photo: "aGVsbG8=" }),
      method: "PUT",
    });

    expect(response.status).toBe(200);
    expect(faces.enrollFaceEverywhere).toHaveBeenCalledWith(
      GYM,
      "worker",
      WORKER,
      "aGVsbG8=",
      WORKER
    );
  });

  it("registers without a photo when the body is empty", async () => {
    faces.enrollFaceEverywhere.mockResolvedValue({ enrolled: 1, failed: [] });

    // How the dialog puts somebody on a terminal so the device can then take the
    // photo itself — the better template, and the usual route.
    await request(FACE, { body: JSON.stringify({}), method: "PUT" });

    expect(faces.enrollFaceEverywhere).toHaveBeenCalledWith(
      GYM,
      "worker",
      WORKER,
      undefined,
      WORKER
    );
  });

  it("arms and disarms the fallback capture", async () => {
    const armed = await request(`${FACE}/capture`, { method: "POST" });

    expect(armed.status).toBe(204);
    expect(faces.armFaceCapture).toHaveBeenCalledWith(GYM, "worker", WORKER);

    const disarmed = await request(`${FACE}/capture`, { method: "DELETE" });

    expect(disarmed.status).toBe(204);
    expect(faces.disarmFaceCapture).toHaveBeenCalledWith(GYM);
  });

  it("revokes the face, which is how a sacked worker stops clocking in", async () => {
    faces.revokeFaceEverywhere.mockResolvedValue(undefined);

    const response = await request(FACE, { method: "DELETE" });

    expect(response.status).toBe(204);
    expect(faces.revokeFaceEverywhere).toHaveBeenCalledWith(GYM, WORKER);
  });

  it("refuses an unauthenticated enrolment", async () => {
    const response = await app.request(`${FACE}/sync`, { method: "POST" });

    expect(response.status).toBe(401);
    expect(faces.syncFaceStatus).not.toHaveBeenCalled();
  });
});

describe("service-token auth", () => {
  it("rejects a request with no service token", async () => {
    const response = await app.request("/workers");

    expect(response.status).toBe(401);
    expect(service.listWorkers).not.toHaveBeenCalled();
  });
});

describe("GET /workers", () => {
  it("passes the gym from the header to the service", async () => {
    service.listWorkers.mockResolvedValue([]);

    const response = await request("/workers");

    expect(response.status).toBe(200);
    expect(service.listWorkers).toHaveBeenCalledWith(GYM, expect.anything());
  });
});

describe("POST /workers", () => {
  it("creates and returns 201", async () => {
    service.createWorker.mockResolvedValue({
      id: "wrk_1",
      name: "Test Trainer",
    });

    const response = await request("/workers", {
      method: "POST",
      body: JSON.stringify(validWorker),
    });

    expect(response.status).toBe(201);
    expect(service.createWorker).toHaveBeenCalledWith(
      GYM,
      expect.objectContaining({ fullname: "Test Trainer", role: "trainer" })
    );
  });

  it("normalises salary to two decimals", async () => {
    service.createWorker.mockResolvedValue({ id: "wrk_1" });

    await request("/workers", {
      method: "POST",
      body: JSON.stringify({ ...validWorker, salaryAmount: 32_000 }),
    });

    expect(service.createWorker).toHaveBeenCalledWith(
      GYM,
      expect.objectContaining({ salaryAmount: "32000.00" })
    );
  });

  it("rejects an unknown position", async () => {
    const response = await request("/workers", {
      method: "POST",
      body: JSON.stringify({ ...validWorker, role: "wizard" }),
    });

    expect(response.status).toBe(400);
    expect(service.createWorker).not.toHaveBeenCalled();
  });

  it("rejects a malformed shift time", async () => {
    const response = await request("/workers", {
      method: "POST",
      body: JSON.stringify({ ...validWorker, shiftStart: "9am" }),
    });

    expect(response.status).toBe(400);
  });

  it("rejects a missing name", async () => {
    const { fullname, ...rest } = validWorker;

    const response = await request("/workers", {
      method: "POST",
      body: JSON.stringify(rest),
    });

    expect(response.status).toBe(400);
    expect(fullname).toBeDefined();
  });
});

describe("PATCH /workers/:id", () => {
  it("updates and returns 204", async () => {
    service.updateWorker.mockResolvedValue(undefined);

    const response = await request(`/workers/${WORKER}`, {
      method: "PATCH",
      body: JSON.stringify({ salaryAmount: "40000" }),
    });

    expect(response.status).toBe(204);
    expect(service.updateWorker).toHaveBeenCalledWith(GYM, WORKER, {
      salaryAmount: "40000.00",
    });
  });

  it("rejects an empty update", async () => {
    const response = await request(`/workers/${WORKER}`, {
      method: "PATCH",
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
    expect(service.updateWorker).not.toHaveBeenCalled();
  });
});

describe("attendance", () => {
  it("checks in at the given time", async () => {
    service.checkIn.mockResolvedValue(undefined);

    const response = await request(`/workers/${WORKER}/check-in`, {
      method: "POST",
      body: JSON.stringify({ at: "2026-07-23T09:00:00.000Z" }),
    });

    expect(response.status).toBe(204);
    expect(service.checkIn).toHaveBeenCalledWith(GYM, WORKER, {
      at: "2026-07-23T09:00:00.000Z",
    });
  });

  it("checks in with no time (now)", async () => {
    service.checkIn.mockResolvedValue(undefined);

    const response = await request(`/workers/${WORKER}/check-in`, {
      method: "POST",
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(204);
  });

  it("rejects a malformed check-in time", async () => {
    const response = await request(`/workers/${WORKER}/check-in`, {
      method: "POST",
      body: JSON.stringify({ at: "yesterday" }),
    });

    expect(response.status).toBe(400);
    expect(service.checkIn).not.toHaveBeenCalled();
  });

  it("checks out and returns 204", async () => {
    service.checkOut.mockResolvedValue(undefined);

    const response = await request(`/workers/${WORKER}/check-out`, {
      method: "POST",
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(204);
    expect(service.checkOut).toHaveBeenCalledWith(GYM, WORKER, {});
  });
});

describe("payroll", () => {
  const validPayment = {
    amount: "1500000",
    method: "cash",
    period: "2026-07",
  };

  it("reads the payroll for the month asked for", async () => {
    service.getWorkerPayroll.mockResolvedValue({ period: "2026-06" });

    const response = await request(`/workers/${WORKER}/payroll?period=2026-06`);

    expect(response.status).toBe(200);
    expect(service.getWorkerPayroll).toHaveBeenCalledWith(
      GYM,
      WORKER,
      "2026-06"
    );
  });

  it("leaves the month to the service when none is given", async () => {
    service.getWorkerPayroll.mockResolvedValue({});

    await request(`/workers/${WORKER}/payroll`);

    expect(service.getWorkerPayroll).toHaveBeenCalledWith(
      GYM,
      WORKER,
      undefined
    );
  });

  it("rejects a period that is not a month", async () => {
    const response = await request(`/workers/${WORKER}/payroll?period=july`);

    expect(response.status).toBe(400);
    expect(service.getWorkerPayroll).not.toHaveBeenCalled();
  });

  it("records a payment and returns 204", async () => {
    service.payWorker.mockResolvedValue(undefined);

    const response = await request(`/workers/${WORKER}/pay`, {
      method: "POST",
      body: JSON.stringify(validPayment),
    });

    expect(response.status).toBe(204);
    expect(service.payWorker).toHaveBeenCalledWith(
      GYM,
      WORKER,
      { amount: "1500000.00", method: "cash", period: "2026-07" },
      // The operator on the header — a wage must record who handed it over.
      WORKER
    );
  });

  it("rejects a payment with no month to settle", async () => {
    const { period, ...rest } = validPayment;

    const response = await request(`/workers/${WORKER}/pay`, {
      method: "POST",
      body: JSON.stringify(rest),
    });

    expect(response.status).toBe(400);
    expect(period).toBeDefined();
    expect(service.payWorker).not.toHaveBeenCalled();
  });

  it("rejects a zero payment", async () => {
    const response = await request(`/workers/${WORKER}/pay`, {
      method: "POST",
      body: JSON.stringify({ ...validPayment, amount: "0" }),
    });

    expect(response.status).toBe(400);
    expect(service.payWorker).not.toHaveBeenCalled();
  });

  it("rejects a till that holds no money", async () => {
    // "debt" is a sale where nothing moved; a wage cannot be paid out of it.
    const response = await request(`/workers/${WORKER}/pay`, {
      method: "POST",
      body: JSON.stringify({ ...validPayment, method: "debt" }),
    });

    expect(response.status).toBe(400);
    expect(service.payWorker).not.toHaveBeenCalled();
  });
});

describe("POST /workers/:id/active", () => {
  it("deactivates a worker", async () => {
    service.setWorkerActive.mockResolvedValue(undefined);

    const response = await request(`/workers/${WORKER}/active`, {
      method: "POST",
      body: JSON.stringify({ isActive: false }),
    });

    expect(response.status).toBe(204);
    expect(service.setWorkerActive).toHaveBeenCalledWith(GYM, WORKER, false);
  });
});
