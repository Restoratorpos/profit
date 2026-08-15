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
    get: (key: string) => Promise.resolve(store.get(key) ?? null),
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

/** The successor record is what the grace window is made of; dropping it ends it. */
const lapseGraceWindow = () => {
  for (const key of store.keys()) {
    if (key.startsWith("auth:refresh:rotated:")) {
      store.delete(key);
    }
  }
};

const refresh = async (refreshToken: string) => {
  const response = await post("/auth/refresh", { refreshToken });

  return {
    status: response.status,
    body: (await response.json()) as { refreshToken?: string },
  };
};

describe("POST /auth/refresh — rotation", () => {
  it("spends the presented token and issues a working replacement", async () => {
    const first = await signIn();

    const refreshed = await refresh(first);
    expect(refreshed.status).toBe(200);

    const second = refreshed.body.refreshToken;

    expect(second).not.toBe(first);
    // The replacement carries the session forward.
    expect((await refresh(second ?? "")).status).toBe(200);

    // And once the grace window has passed, the spent one is refused.
    lapseGraceWindow();
    expect((await refresh(first)).status).toBe(401);
  });

  /**
   * The bug this whole grace window exists for.
   *
   * Rotation revokes the presented token *here*, while its replacement travels
   * back inside the response. A response that never arrives — the page was
   * reloaded mid-flight, the dev server restarted, the desk's Wi-Fi dropped —
   * therefore left the browser holding a cookie that was already dead, with no
   * way to ever learn its successor. The session was unrecoverable, and reloading
   * a few times in a row is enough to land in that window.
   */
  it("repeats the same replacement when the first answer was lost", async () => {
    const first = await signIn();

    // The answer the browser never saw.
    const lost = await refresh(first);
    // The next page load, still presenting the only cookie it has.
    const retry = await refresh(first);

    expect(retry.status).toBe(200);
    expect(retry.body.refreshToken).toBe(lost.body.refreshToken);
  });

  /**
   * Repeating must not fork the chain. Two live successors would mean a stolen
   * token quietly running alongside the real one, which is the exact property
   * rotation is here to deny — so the replay hands back what was already issued
   * rather than minting more.
   */
  it("does not mint a second chain for a repeated exchange", async () => {
    const first = await signIn();
    const original = (await refresh(first)).body.refreshToken ?? "";

    await refresh(first);
    lapseGraceWindow();

    // The one and only successor still works after the replays.
    expect((await refresh(original)).status).toBe(200);
  });

  it("never replays a token that was revoked by signing out", async () => {
    const refreshToken = await signIn();
    await post("/auth/logout", { refreshToken });

    // Sign-out records no successor, so there is nothing to hand back.
    expect((await refresh(refreshToken)).status).toBe(401);
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
