import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `GET /workers/payments` — the whole-gym salary history behind the staff
 * page's history button.
 *
 * Only the two service reads are stubbed; everything else in the module is the
 * real thing, so `rangeFromQuery` still parses the dates the way the handler
 * will in production. Importing the module is safe without a database: the
 * mysql2 pool is lazy and nothing here makes it dial out.
 */
vi.mock("../src/services/worker.service.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../src/services/worker.service.js")
  >()),
  listSalaryPayments: vi.fn(() =>
    Promise.resolve({ options: [], rows: [], total: 0, totalAmount: "0.00" })
  ),
  getWorkerDetail: vi.fn(() => Promise.resolve(null)),
}));

const { app } = await import("../src/app.js");
const { signAccessToken } = await import("../src/lib/jwt.js");
const { getWorkerDetail, listSalaryPayments } = await import(
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

const getPayments = (search = "") =>
  app.request(`/workers/payments${search}`, { headers: auth });

/** The arguments the handler forwarded on the most recent request. */
const lastCall = () => vi.mocked(listSalaryPayments).mock.calls.at(-1);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /workers/payments", () => {
  it("is not swallowed by the /:workerId route", async () => {
    /*
     * Hono matches in registration order, so a `/payments` registered below
     * `/:workerId` would be read as a worker whose id is the literal string
     * "payments" — a 200 carrying one worker's detail instead of the gym's
     * payment history, which is the kind of wrong that looks right.
     */
    const response = await getPayments();

    expect(response.status).toBe(200);
    expect(listSalaryPayments).toHaveBeenCalledTimes(1);
    expect(getWorkerDetail).not.toHaveBeenCalled();
  });

  it("scopes to the gym in the token", async () => {
    await getPayments();

    expect(lastCall()?.[0]).toBe(TOKEN_GYM);
  });

  it("ignores a hostile tenant header", async () => {
    // The tenant is a signed claim; `x-gym-id` is inert under a bearer token.
    await app.request("/workers/payments", {
      headers: { ...auth, "x-gym-id": "gym_belonging_to_someone_else" },
    });

    expect(lastCall()?.[0]).toBe(TOKEN_GYM);
  });

  it("defaults to the first page and no worker filter", async () => {
    await getPayments();

    const query = lastCall()?.[2];

    expect(query?.page).toBe(1);
    expect(query?.pageSize).toBe(25);
    // Absent, not "all" — the sentinel is the browser's, and the query builder
    // drops it rather than sending it on.
    expect(query?.workerId).toBeUndefined();
  });

  it("passes the worker filter and paging through", async () => {
    await getPayments("?workerId=wkr_7&page=3&pageSize=10");

    const query = lastCall()?.[2];

    expect(query?.workerId).toBe("wkr_7");
    expect(query?.page).toBe(3);
    expect(query?.pageSize).toBe(10);
  });

  it("turns the date bounds into a range that covers the last day", async () => {
    await getPayments("?from=2026-07-01&to=2026-07-31");

    const range = lastCall()?.[1];

    expect(range?.from.getFullYear()).toBe(2026);
    expect(range?.from.getMonth()).toBe(6);
    expect(range?.from.getDate()).toBe(1);
    // A date-only "to" has to include the whole of that day, or every payment
    // handed over on the last day of the month falls outside the month.
    expect(range?.to.getDate()).toBe(31);
    expect(range?.to.getHours()).toBe(23);
  });

  it("rejects a page size beyond the cap", async () => {
    const response = await getPayments("?pageSize=5000");

    expect(response.status).toBe(400);
    expect(listSalaryPayments).not.toHaveBeenCalled();
  });

  it("refuses a request with no credentials", async () => {
    const response = await app.request("/workers/payments");

    expect(response.status).toBe(401);
    expect(listSalaryPayments).not.toHaveBeenCalled();
  });
});
