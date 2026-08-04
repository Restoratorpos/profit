import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The boot sequence must always paint something.
 *
 * This exists because it once did not: the session was restored with a
 * top-level `await` before `createRoot().render()`, so a request that hung —
 * and a dev proxy pointing at a backend that is not listening holds a request
 * open rather than refusing it — meant React never mounted. A blank page, a tab
 * that span forever, and no error anywhere to explain it.
 *
 * Each case re-imports the auth modules. `refreshInFlight` in lib/auth/api.ts is
 * module state deduplicating concurrent refreshes, so without a reset the
 * never-settling case below would leave a pending promise that every later case
 * awaits forever.
 */
const renderProbe = async () => {
  vi.resetModules();

  const { AuthProvider, useAuth } = await import("@/lib/auth/context");

  const Probe = () => {
    const { isRestoring, isOffline, isAuthenticated } = useAuth();

    if (isRestoring) {
      return <output>restoring</output>;
    }

    if (isOffline) {
      return <output>offline</output>;
    }

    return <output>{isAuthenticated ? "signed-in" : "signed-out"}</output>;
  };

  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
};

const jsonResponse = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("boot session restore", () => {
  it("renders immediately while the session check is still in flight", async () => {
    // A request that never settles — the exact case that used to blank the app.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => undefined))
    );

    await renderProbe();

    // The tree is mounted and readable, rather than nothing at all.
    expect(screen.getByText("restoring")).toBeDefined();
  });

  it("settles to signed-out when there is no session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(jsonResponse({ error: { code: "unauthorized" } }, 401))
      )
    );

    await renderProbe();

    await waitFor(() => expect(screen.getByText("signed-out")).toBeDefined());
  });

  /**
   * An unreachable backend is not a signed-out operator, and saying it is was
   * half of why reloading a few times dumped people at the sign-in screen.
   * `tsx watch` restarts the API on every save; the desk's Wi-Fi drops packets.
   * Neither is a statement about the session, so neither may end one.
   */
  it("settles to offline, not signed-out, when the backend is unreachable", async () => {
    // Not a 401 — a rejected fetch, which is what an unreachable proxy gives.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("ECONNREFUSED")))
    );

    await renderProbe();

    await waitFor(() => expect(screen.getByText("offline")).toBeDefined(), {
      timeout: 5000,
    });
  });

  it("rides out a blip that clears before the retries run out", async () => {
    let attempts = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        attempts += 1;

        // The API was mid-restart for the first call and answers the second.
        return attempts === 1
          ? Promise.reject(new Error("ECONNREFUSED"))
          : Promise.resolve(
              jsonResponse(
                {
                  accessToken: "fresh",
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
            );
      })
    );

    await renderProbe();

    await waitFor(() => expect(screen.getByText("signed-in")).toBeDefined(), {
      timeout: 5000,
    });
  });

  it("adopts the session when the refresh cookie is still good", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse(
            {
              accessToken: "fresh",
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

    await renderProbe();

    await waitFor(() => expect(screen.getByText("signed-in")).toBeDefined());
  });
});
