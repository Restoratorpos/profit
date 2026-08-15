import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `GET /workers/shifts` — the whole-gym work history, the other half of the
 * history drawer that `/workers/payments` fills.
 *
 * Stubbed and driven exactly like `salary-history.test.ts`, because the two are
 * meant to stay the same shape: same filters, same paging, same tenant rules.
 * If one of them drifts, the drawer that switches between them starts answering
 * two different questions about the period on screen.
 */
vi.mock("../src/services/worker.service.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../src/services/worker.service.js")
  >()),
  listWorkHistory: vi.fn(() =>
    Promise.resolve({ options: [], rows: [], total: 0, totalMinutes: 0 })
  ),
  getWorkerDetail: vi.fn(() => Promise.resolve(null)),
}));

const { app } = await import("../src/app.js");
const { signAccessToken } = await import("../src/lib/jwt.js");
const { getWorkerDetail, listWorkHistory } = await import(
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

const getShifts = (search = "") =>
  app.request(`/workers/shifts${search}`, { headers: auth });

/** The arguments the handler forwarded on the most recent request. */
const lastCall = () => vi.mocked(listWorkHistory).mock.calls.at(-1);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /workers/shifts", () => {
  it("is not swallowed by the /:workerId route", async () => {
    /*
     * The same trap `/payments` sits above: registered below `/:workerId` this
     * would be read as a worker whose id is the literal string "shifts", and
     * answer 200 with one worker's detail — wrong in a way that looks right.
     */
    const response = await getShifts();

    expect(response.status).toBe(200);
    expect(listWorkHistory).toHaveBeenCalledTimes(1);
    expect(getWorkerDetail).not.toHaveBeenCalled();
  });

  it("scopes to the gym in the token", async () => {
    await getShifts();

    expect(lastCall()?.[0]).toBe(TOKEN_GYM);
  });

  it("ignores a hostile tenant header", async () => {
    // The tenant is a signed claim; `x-gym-id` is inert under a bearer token.
    await app.request("/workers/shifts", {
      headers: { ...auth, "x-gym-id": "gym_belonging_to_someone_else" },
    });

    expect(lastCall()?.[0]).toBe(TOKEN_GYM);
  });

  it("defaults to the first page and no worker filter", async () => {
    await getShifts();

    const query = lastCall()?.[2];

    expect(query?.page).toBe(1);
    expect(query?.pageSize).toBe(25);
    // Absent, not "all" — the sentinel belongs to the browser, and the query
    // builder drops it rather than sending it on.
    expect(query?.workerId).toBeUndefined();
  });

  it("passes the worker filter and paging through", async () => {
    await getShifts("?workerId=wkr_7&page=3&pageSize=10");

    const query = lastCall()?.[2];

    expect(query?.workerId).toBe("wkr_7");
    expect(query?.page).toBe(3);
    expect(query?.pageSize).toBe(10);
  });

  it("turns the date bounds into a range that covers the last day", async () => {
    await getShifts("?from=2026-07-01&to=2026-07-31");

    const range = lastCall()?.[1];

    expect(range?.from.getFullYear()).toBe(2026);
    expect(range?.from.getMonth()).toBe(6);
    expect(range?.from.getDate()).toBe(1);
    // A shift clocked on the last day of the month has to fall inside it.
    expect(range?.to.getDate()).toBe(31);
    expect(range?.to.getHours()).toBe(23);
  });

  it("rejects a page size beyond the cap", async () => {
    const response = await getShifts("?pageSize=5000");

    expect(response.status).toBe(400);
    expect(listWorkHistory).not.toHaveBeenCalled();
  });

  it("refuses a request with no credentials", async () => {
    const response = await app.request("/workers/shifts");

    expect(response.status).toBe(401);
    expect(listWorkHistory).not.toHaveBeenCalled();
  });
});
