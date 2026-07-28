import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Worker } from "../src/db/schema.js";

/**
 * The browser session shape: refresh token in an httpOnly cookie, access token
 * in the body for the tab to hold in memory.
 *
 * The property under test throughout is that the refresh token is never in a
 * place page scripts can read.
 */
const store = vi.hoisted(() => new Map<string, string>());

vi.mock("../src/lib/redis.js", () => ({
  redis: {
    isOpen: true,
    set: (key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve("OK");
    },
    exists: (key: string) => Promise.resolve(store.has(key) ? 1 : 0),
    del: (key: string) => Promise.resolve(store.delete(key) ? 1 : 0),
    incr: () => Promise.resolve(1),
    expire: () => Promise.resolve(true),
    ttl: () => Promise.resolve(60),
  },
}));

const state = vi.hoisted(() => ({ rows: [] as Worker[] }));

vi.mock("../src/db/index.js", () => {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(state.rows),
  };

  return { db: { select: () => chain, transaction: vi.fn() } };
});

const { app } = await import("../src/app.js");
const { hashPassword } = await import("../src/lib/password.js");

const PASSWORD = "1111";
const PHONE = "998907661770";
const passwordHash = await hashPassword(PASSWORD);

const worker: Worker = {
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
};

const post = (path: string, body: unknown, cookie?: string) =>
  app.request(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });

/** Pulls `profit_refresh=...` out of a Set-Cookie header, ready to send back. */
const cookieFrom = (response: Response): string => {
  const header = response.headers.get("set-cookie") ?? "";
  const value = header.split(";")[0];

  return value ?? "";
};

const signInWithCookie = () =>
  post("/auth/login", { phone: PHONE, password: PASSWORD, mode: "cookie" });

beforeEach(() => {
  store.clear();
  state.rows = [worker];
});

describe("POST /auth/login — cookie mode", () => {
  it("puts the refresh token in an httpOnly cookie and keeps it out of the body", async () => {
    const response = await signInWithCookie();
    const body = (await response.json()) as Record<string, unknown>;
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(setCookie).toContain("profit_refresh=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");

    // The access token is the tab's to hold; the refresh token is not.
    expect(body.accessToken).toBeTruthy();
    expect(body).not.toHaveProperty("refreshToken");
    expect(JSON.stringify(body)).not.toContain(
      cookieFrom(response).split("=")[1] ?? "never-matches"
    );
  });

  it("leaves non-browser clients exactly as they were", async () => {
    const response = await post("/auth/login", {
      phone: PHONE,
      password: PASSWORD,
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(body.refreshToken).toBeTruthy();
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});

describe("POST /auth/refresh — cookie mode", () => {
  it("refreshes from the cookie alone, with an empty body", async () => {
    const cookie = cookieFrom(await signInWithCookie());

    const response = await post("/auth/refresh", {}, cookie);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.accessToken).toBeTruthy();
    expect(body).not.toHaveProperty("refreshToken");
    // Rotated, so the browser is handed a replacement cookie.
    expect(response.headers.get("set-cookie")).toContain("profit_refresh=");
  });

  it("rotates the cookie, so the previous one stops working", async () => {
    const first = cookieFrom(await signInWithCookie());
    const rotated = await post("/auth/refresh", {}, first);

    expect(rotated.status).toBe(200);

    const replayed = await post("/auth/refresh", {}, first);
    expect(replayed.status).toBe(401);

    const second = cookieFrom(rotated);
    expect(second).not.toBe(first);
    await expect(
      post("/auth/refresh", {}, second).then((r) => r.status)
    ).resolves.toBe(200);
  });

  /**
   * The SPA asks this on every cold load to discover whether it has a session,
   * so a signed-out visitor hits it constantly. 401 says "not signed in", which
   * is the honest answer; 400 would frame the normal case as a client bug.
   */
  it("answers a request carrying neither cookie nor body token with 401", async () => {
    const response = await post("/auth/refresh", {});

    expect(response.status).toBe(401);
  });
});

describe("POST /auth/logout — cookie mode", () => {
  it("revokes the cookie's token and clears the cookie", async () => {
    const cookie = cookieFrom(await signInWithCookie());

    const response = await post("/auth/logout", {}, cookie);

    expect(response.status).toBe(204);
    // Expiring the cookie is what actually signs the browser out.
    expect(response.headers.get("set-cookie")).toContain("profit_refresh=;");

    const reused = await post("/auth/refresh", {}, cookie);
    expect(reused.status).toBe(401);
  });

  it("clears the cookie even when the token it carried was unreadable", async () => {
    const response = await post("/auth/logout", {}, "profit_refresh=nonsense");

    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toContain("profit_refresh=;");
  });
});
