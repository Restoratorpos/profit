import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { refreshSession } from "../src/lib/api/client";
import { restoreSession } from "../src/lib/auth/api";
import { getAccessToken, setAccessToken } from "../src/lib/auth/tokens";

/**
 * Guards the difference between "the server rejected the session" and "the
 * request never got an answer".
 *
 * Clearing the access token is not a local tidy-up: `AuthProvider` listens for
 * it, drops the user and purges the query cache. So treating a dropped
 * connection as a rejection signs the operator out for real.
 *
 * That is what made localhost unusable. `tsx watch` restarts the API on every
 * save, so any request in flight at that moment failed at the transport — and
 * the old code cleared the token on *any* failure, with no bad credential
 * anywhere in the picture. On the front desk the same thing happens whenever
 * the LAN hiccups mid-shift.
 */

const jsonResponse = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

beforeEach(() => {
  setAccessToken("a-live-access-token");
});

afterEach(() => {
  setAccessToken(null);
  vi.unstubAllGlobals();
});

describe("a refresh the server refuses", () => {
  it("ends the session on 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(jsonResponse({ error: {} }, 401)))
    );

    await refreshSession();

    expect(getAccessToken()).toBeNull();
  });

  it("ends the session on 403", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(jsonResponse({ error: {} }, 403)))
    );

    await refreshSession();

    expect(getAccessToken()).toBeNull();
  });
});

describe("a refresh that never completes", () => {
  it("keeps the session when the connection drops", async () => {
    // What a restarting dev server, a dropped Wi-Fi packet, or the 10s timeout
    // all look like from here. No verdict was reached, so none is drawn.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch")))
    );

    const session = await refreshSession();

    expect(session).toBeNull();
    expect(getAccessToken()).toBe("a-live-access-token");
  });

  it("keeps the session when the proxy answers 502", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("bad gateway", { status: 502 })))
    );

    await refreshSession();

    expect(getAccessToken()).toBe("a-live-access-token");
  });

  it("keeps the session when the API is down with a 500", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(jsonResponse({ error: {} }, 500)))
    );

    await refreshSession();

    expect(getAccessToken()).toBe("a-live-access-token");
  });
});

/**
 * The boot check is the *only* thing that decides whether a reload lands the
 * operator back in the app or at the sign-in screen — the access token lives in
 * memory and does not survive a reload. So its answer has to be a verdict, not
 * whatever the first request happened to do.
 */
describe("the boot session restore", () => {
  const session = {
    accessToken: "a-fresh-access-token",
    user: {
      id: "wkr_1",
      phone: "998907661770",
      name: "Owner",
      role: "owner",
      gymId: "gym_1",
      branchId: "brn_1",
    },
  };

  it("takes a rejection at face value and does not retry it", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(jsonResponse({ error: {} }, 401))
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(restoreSession()).resolves.toEqual({ status: "signed-out" });
    // Nothing to retry: the server read the cookie and said no.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("asks again when the request goes unanswered", async () => {
    const fetchMock = vi.fn(() => Promise.reject(new TypeError("failed")));
    vi.stubGlobal("fetch", fetchMock);

    await expect(restoreSession()).resolves.toEqual({ status: "offline" });
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  });

  it("recovers when a retry gets through", async () => {
    let attempts = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        attempts += 1;

        return attempts === 1
          ? Promise.reject(new TypeError("failed"))
          : Promise.resolve(jsonResponse(session, 200));
      })
    );

    await expect(restoreSession()).resolves.toEqual({
      status: "session",
      session,
    });
  });
});

describe("a refresh that succeeds", () => {
  it("adopts the new access token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse(
            {
              accessToken: "a-fresh-access-token",
              user: {
                id: "wkr_1",
                phone: "998907661770",
                name: "Owner",
                role: "owner",
                gymId: "gym_1",
                branchId: "brn_1",
              },
            },
            200
          )
        )
      )
    );

    const session = await refreshSession();

    expect(session?.accessToken).toBe("a-fresh-access-token");
    expect(getAccessToken()).toBe("a-fresh-access-token");
  });
});
