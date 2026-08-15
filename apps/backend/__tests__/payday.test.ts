import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `/workers/payday` — the day of the month monthly salaries are settled on.
 *
 * A gym-wide setting stored on `gyms.payday`, so the thing worth asserting is
 * that it is scoped to the token's gym and that the day it accepts is one that
 * exists in every month.
 */
vi.mock("../src/services/worker.service.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../src/services/worker.service.js")
  >()),
  getPayday: vi.fn(() => Promise.resolve(9)),
  setPayday: vi.fn(() => Promise.resolve()),
  getWorkerDetail: vi.fn(() => Promise.resolve(null)),
}));

const { app } = await import("../src/app.js");
const { signAccessToken } = await import("../src/lib/jwt.js");
const { getPayday, getWorkerDetail, setPayday } = await import(
  "../src/services/worker.service.js"
);

const TOKEN_GYM = "gym_from_the_token";

const accessToken = signAccessToken({
  id: "wkr_000000000000000001",
  phone: "998907661770",
  name: "Owner",
  role: "owner",
  gymId: TOKEN_GYM,
  branchId: "brn_00000000000000001",
});

const auth = { Authorization: `Bearer ${accessToken}` };

const put = (body: unknown) =>
  app.request("/workers/payday", {
    method: "PUT",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /workers/payday", () => {
  it("is not swallowed by the /:workerId route", async () => {
    // Registered above `/:workerId`, or this reads as a worker called "payday".
    const response = await app.request("/workers/payday", { headers: auth });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ payday: 9 });
    expect(getWorkerDetail).not.toHaveBeenCalled();
  });

  it("scopes to the gym in the token", async () => {
    await app.request("/workers/payday", {
      headers: { ...auth, "x-gym-id": "gym_belonging_to_someone_else" },
    });

    expect(vi.mocked(getPayday).mock.calls.at(-1)?.[0]).toBe(TOKEN_GYM);
  });

  it("refuses a request with no credentials", async () => {
    const response = await app.request("/workers/payday");

    expect(response.status).toBe(401);
    expect(getPayday).not.toHaveBeenCalled();
  });
});

describe("PUT /workers/payday", () => {
  it("saves a day against the token's gym", async () => {
    const response = await put({ payday: 15 });

    expect(response.status).toBe(204);
    expect(setPayday).toHaveBeenCalledWith(TOKEN_GYM, 15);
  });

  it("accepts the first and last day it offers", async () => {
    expect((await put({ payday: 1 })).status).toBe(204);
    expect((await put({ payday: 28 })).status).toBe(204);
  });

  it("rejects a day past the 28th", async () => {
    /*
     * February has no 29th in most years and no 30th ever. A payday that does
     * not occur every month would skip one silently, so the schema refuses it
     * rather than the desk discovering it in February.
     */
    const response = await put({ payday: 31 });

    expect(response.status).toBe(400);
    expect(setPayday).not.toHaveBeenCalled();
  });

  it("rejects a day before the first", async () => {
    expect((await put({ payday: 0 })).status).toBe(400);
    expect(setPayday).not.toHaveBeenCalled();
  });

  it("rejects a fractional day", async () => {
    expect((await put({ payday: 9.5 })).status).toBe(400);
    expect(setPayday).not.toHaveBeenCalled();
  });

  it("refuses a write with no credentials", async () => {
    const response = await app.request("/workers/payday", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payday: 9 }),
    });

    expect(response.status).toBe(401);
    expect(setPayday).not.toHaveBeenCalled();
  });
});
