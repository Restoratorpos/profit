import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api/client";
import { getAccessToken, setAccessToken } from "@/lib/auth/tokens";

const SESSION = {
  user: {
    id: "wkr_1",
    phone: "998907661770",
    name: "Owner",
    role: "owner",
    gymId: "gym_1",
    branchId: "brn_1",
  },
  accessToken: "fresh-access-token",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const unauthorized = () =>
  json(
    { error: { code: "unauthorized", message: "Invalid or expired token" } },
    401
  );

/** Requests the mock has seen, in order, as "METHOD /path". */
let calls: string[] = [];

const mockFetch = (
  handler: (path: string, init: RequestInit) => Response | Promise<Response>
) => {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string, init: RequestInit = {}) => {
      calls.push(`${init.method ?? "GET"} ${input}`);
      return Promise.resolve(handler(input, init));
    })
  );
};

beforeEach(() => {
  calls = [];
  setAccessToken("stale-access-token");
  vi.unstubAllGlobals();
});

describe("apiFetch", () => {
  it("renews the access token once on a 401 and replays the request", async () => {
    mockFetch((path) => {
      if (path.endsWith("/auth/refresh")) {
        return json(SESSION);
      }

      // 401 the first time, succeed once the token has been renewed.
      return getAccessToken() === SESSION.accessToken
        ? json({ ok: true })
        : unauthorized();
    });

    await expect(apiFetch("/members")).resolves.toEqual({ ok: true });
    expect(getAccessToken()).toBe(SESSION.accessToken);
    expect(calls).toEqual([
      "GET /api/members",
      "POST /api/auth/refresh",
      "GET /api/members",
    ]);
  });

  /**
   * The property that keeps rotation from eating itself.
   *
   * The backend revokes a refresh token when it is used, so two concurrent
   * refreshes would race: the first rotates, the second presents a token that is
   * now revoked and gets a 401 — signing the operator out in the middle of a
   * shift. A dashboard fires many queries at once, so several 401s arriving
   * together is the normal case, not an edge one.
   */
  it("refreshes only once when several requests 401 together", async () => {
    mockFetch((path) => {
      if (path.endsWith("/auth/refresh")) {
        return json(SESSION);
      }

      return getAccessToken() === SESSION.accessToken
        ? json({ ok: true })
        : unauthorized();
    });

    await Promise.all([
      apiFetch("/members"),
      apiFetch("/orders"),
      apiFetch("/plans"),
    ]);

    const refreshes = calls.filter((call) => call.includes("/auth/refresh"));
    expect(refreshes).toHaveLength(1);
  });

  it("gives up and clears the token when the refresh itself fails", async () => {
    mockFetch(() => unauthorized());

    await expect(apiFetch("/members")).rejects.toMatchObject({ status: 401 });
    // Cleared, so the AuthProvider can turn this into signed-out UI rather than
    // a screen of failing requests.
    expect(getAccessToken()).toBeNull();
  });

  it("does not retry a second time when the replay also 401s", async () => {
    mockFetch((path) =>
      path.endsWith("/auth/refresh") ? json(SESSION) : unauthorized()
    );

    await expect(apiFetch("/members")).rejects.toMatchObject({ status: 401 });

    const refreshes = calls.filter((call) => call.includes("/auth/refresh"));
    expect(refreshes).toHaveLength(1);
  });
});
