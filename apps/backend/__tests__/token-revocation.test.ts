import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Worker } from "../src/db/schema.js";

/**
 * Sign-out and refresh rotation, which are the two things that make a
 * browser-held refresh token safe to issue.
 *
 * Both need Redis, so it is faked in memory here. The fake is deliberately
 * thin — set/exists/del is the entire surface lib/token-denylist.ts uses, and a
 * richer one would only be testing itself.
 */
const store = vi.hoisted(() => new Map<string, string>());

vi.mock("../src/lib/redis.js", () => ({
  isRedisAvailable: () => true,
  redis: {
    isOpen: true,
    isReady: true,
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

const post = (path: string, body: unknown) =>
  app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const signIn = async (): Promise<string> => {
  const response = await post("/auth/login", {
    phone: PHONE,
    password: PASSWORD,
  });

  return ((await response.json()) as { refreshToken: string }).refreshToken;
};

beforeEach(() => {
  store.clear();
  state.rows = [worker];
});

describe("POST /auth/logout", () => {
  it("revokes the refresh token it is given", async () => {
    const refreshToken = await signIn();

    const loggedOut = await post("/auth/logout", { refreshToken });
    expect(loggedOut.status).toBe(204);

    const reused = await post("/auth/refresh", { refreshToken });
    expect(reused.status).toBe(401);
  });

  /**
   * Sign-out is a request, not a question. Answering differently for a token
   * that was never valid would turn this into an oracle for guessing which
   * tokens are real.
   */
  it("answers a garbage token exactly as it answers a real one", async () => {
    const real = await post("/auth/logout", { refreshToken: await signIn() });
    const garbage = await post("/auth/logout", { refreshToken: "nonsense" });

    expect(garbage.status).toBe(real.status);
  });

  it("is idempotent", async () => {
    const refreshToken = await signIn();

    await post("/auth/logout", { refreshToken });
    const second = await post("/auth/logout", { refreshToken });

    expect(second.status).toBe(204);
  });
});

describe("POST /auth/refresh — rotation", () => {
  it("spends the presented token and issues a working replacement", async () => {
    const first = await signIn();

    const refreshed = await post("/auth/refresh", { refreshToken: first });
    expect(refreshed.status).toBe(200);

    const { refreshToken: second } = (await refreshed.json()) as {
      refreshToken: string;
    };

    // The old one is spent...
    const replayed = await post("/auth/refresh", { refreshToken: first });
    expect(replayed.status).toBe(401);

    // ...and the new one carries the session forward.
    expect(second).not.toBe(first);
    const again = await post("/auth/refresh", { refreshToken: second });
    expect(again.status).toBe(200);
  });

  it("reports a revoked token exactly as it reports a forged one", async () => {
    const refreshToken = await signIn();
    await post("/auth/logout", { refreshToken });

    const revoked = await post("/auth/refresh", { refreshToken });
    const forged = await post("/auth/refresh", { refreshToken: "nonsense" });

    expect(revoked.status).toBe(forged.status);
    await expect(revoked.json()).resolves.toEqual(await forged.json());
  });

  it("refuses to refresh a session whose worker has been deactivated", async () => {
    const refreshToken = await signIn();
    state.rows = [{ ...worker, status: "inactive" }];

    const response = await post("/auth/refresh", { refreshToken });

    expect(response.status).toBe(401);
  });
});
