import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Worker } from "../src/db/schema.js";

/**
 * The database is mocked outright: DB_HOST is a live remote server, and these
 * tests assert behaviour that should not depend on a network round-trip. The
 * mock only has to satisfy the select-chain the auth service actually uses.
 */
const state = vi.hoisted(() => ({ rows: [] as Worker[] }));

vi.mock("../src/db/index.js", () => {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(state.rows),
  };

  return {
    db: {
      select: () => chain,
      transaction: vi.fn(),
    },
  };
});

const { app } = await import("../src/app.js");
const { hashPassword } = await import("../src/lib/password.js");

const PASSWORD = "1111";
const PHONE = "998907661770";

const passwordHash = await hashPassword(PASSWORD);

const worker = (overrides: Partial<Worker> = {}): Worker => ({
  workerId: "wkr_000000000000000001",
  gymId: "gym_00000000000000001",
  branchId: "brn_00000000000000001",
  fullname: "Owner",
  phone: PHONE,
  role: "owner",
  login: PHONE,
  passwordHash,
  salaryType: null,
  salaryAmount: null,
  expectedStart: null,
  lateGraceMin: 0,
  status: "active",
  hiredAt: null,
  createdAt: null,
  ...overrides,
});

const verify = (body: unknown) =>
  app.request("/auth/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  state.rows = [];
});

describe("POST /auth/verify", () => {
  it("returns the safe user shape the web app signs in with", async () => {
    state.rows = [worker()];

    const response = await verify({ phone: PHONE, password: PASSWORD });

    expect(response.status).toBe(200);
    // packages/auth builds the session from exactly these fields. gymId is
    // load-bearing: without it the web app cannot scope a single query.
    await expect(response.json()).resolves.toEqual({
      id: "wkr_000000000000000001",
      phone: PHONE,
      name: "Owner",
      role: "owner",
      gymId: "gym_00000000000000001",
      branchId: "brn_00000000000000001",
    });
  });

  it("never leaks the password hash", async () => {
    state.rows = [worker()];

    const response = await verify({ phone: PHONE, password: PASSWORD });

    expect(JSON.stringify(await response.json())).not.toContain(passwordHash);
  });

  it("rejects a wrong password", async () => {
    state.rows = [worker()];

    const response = await verify({ phone: PHONE, password: "wrong" });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "invalid_credentials",
        message: "Invalid phone number or password",
      },
    });
  });

  it("answers an unknown phone exactly as it answers a wrong password", async () => {
    state.rows = [];

    const unknown = await verify({ phone: "998900000000", password: PASSWORD });

    state.rows = [worker()];
    const wrong = await verify({ phone: PHONE, password: "wrong" });

    expect(unknown.status).toBe(wrong.status);
    await expect(unknown.json()).resolves.toEqual(await wrong.json());
  });

  it("refuses a worker who is not active", async () => {
    state.rows = [worker({ status: "inactive" })];

    const response = await verify({ phone: PHONE, password: PASSWORD });

    expect(response.status).toBe(401);
  });

  it("refuses to guess when two active workers share a phone", async () => {
    state.rows = [
      worker(),
      worker({ workerId: "wkr_000000000000000002", gymId: "gym_2" }),
    ];

    const response = await verify({ phone: PHONE, password: PASSWORD });

    expect(response.status).toBe(401);
  });

  it("refuses a worker with no gym, who cannot be tenant-scoped", async () => {
    state.rows = [worker({ gymId: null })];

    const response = await verify({ phone: PHONE, password: PASSWORD });

    expect(response.status).toBe(401);
  });

  it("accepts human phone formatting", async () => {
    state.rows = [worker()];

    const response = await verify({
      phone: "+998 90 766 17 70",
      password: PASSWORD,
    });

    expect(response.status).toBe(200);
  });

  it("rejects a malformed body with 400, not 401", async () => {
    const response = await verify({ phone: "12", password: "1" });

    expect(response.status).toBe(400);
  });
});

describe("POST /auth/login", () => {
  it("issues a token pair carrying the tenant the worker belongs to", async () => {
    state.rows = [worker()];

    const response = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: PHONE, password: PASSWORD }),
    });

    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      user: { gymId: string; branchId: string; role: string };
      accessToken: string;
      refreshToken: string;
    };

    expect(body.user.gymId).toBe("gym_00000000000000001");
    expect(body.user.branchId).toBe("brn_00000000000000001");
    expect(body.user.role).toBe("owner");
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
  });
});

describe("POST /auth/refresh", () => {
  it("rejects an access token used as a refresh token", async () => {
    state.rows = [worker()];

    const login = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: PHONE, password: PASSWORD }),
    });

    const { accessToken } = (await login.json()) as { accessToken: string };

    const response = await app.request("/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: accessToken }),
    });

    // The two secrets are deliberately different.
    expect(response.status).toBe(401);
  });
});
