import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The settings surface: reading and renaming the tenant, and changing your own
 * password.
 *
 * Both services are mocked, so this is about the door rather than the SQL —
 * which tenant a handler scopes to, which roles get past it, and what a bad
 * payload does. Those are the parts that fail silently and expensively.
 */
vi.mock("../src/services/gym.service.js", () => ({
  getGymSettings: vi.fn(() =>
    Promise.resolve({
      id: "gym_from_the_token",
      name: "ProFit",
      ownerName: "Owner",
      phone: "998907661770",
      planTier: "free",
      branchId: "brn_00000000000000001",
      branchName: "Main",
      openTime: "08:00",
      closeTime: "23:00",
    })
  ),
  updateGymSettings: vi.fn(() => Promise.resolve({ id: "gym_from_the_token" })),
}));

vi.mock("../src/services/auth.service.js", () => ({
  changePassword: vi.fn(() => Promise.resolve()),
  login: vi.fn(),
  logout: vi.fn(),
  refreshSession: vi.fn(),
  register: vi.fn(),
  verifyCredentials: vi.fn(),
}));

const { app } = await import("../src/app.js");
const { signAccessToken } = await import("../src/lib/jwt.js");
const { getGymSettings, updateGymSettings } = await import(
  "../src/services/gym.service.js"
);
const { changePassword } = await import("../src/services/auth.service.js");

const TOKEN_GYM = "gym_from_the_token";
const HOSTILE_GYM = "gym_belonging_to_someone_else";
const SERVICE_TOKEN = "test-service-token-at-least-16";

const tokenFor = (role: "owner" | "receptionist") =>
  signAccessToken({
    id: "wkr_000000000000000001",
    phone: "998907661770",
    name: "Somebody",
    role,
    gymId: TOKEN_GYM,
    branchId: "brn_00000000000000001",
  });

const owner = tokenFor("owner");
const receptionist = tokenFor("receptionist");

const patchGym = (body: unknown, headers: Record<string, string>) =>
  app.request("/gym", {
    method: "PATCH",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.mocked(getGymSettings).mockClear();
  vi.mocked(updateGymSettings).mockClear();
  vi.mocked(changePassword).mockClear();
});

describe("GET /gym", () => {
  it("answers any signed-in worker, scoped to the gym in the token", async () => {
    const response = await app.request("/gym", {
      headers: { authorization: `Bearer ${receptionist}` },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ name: "ProFit" });
    expect(vi.mocked(getGymSettings).mock.calls.at(-1)?.[0]).toBe(TOKEN_GYM);
  });

  it("ignores x-gym-id — the tenant is a signed claim", async () => {
    await app.request("/gym", {
      headers: {
        authorization: `Bearer ${owner}`,
        "x-gym-id": HOSTILE_GYM,
      },
    });

    expect(vi.mocked(getGymSettings).mock.calls.at(-1)?.[0]).toBe(TOKEN_GYM);
  });

  /**
   * Deliberately not `requireCaller`. The service door takes its tenant from a
   * request header, so accepting it here would let anyone holding the shared
   * secret rename any gym in the system by typing its id.
   */
  it("refuses the service token, which names its own tenant", async () => {
    const response = await app.request("/gym", {
      headers: { "x-service-token": SERVICE_TOKEN, "x-gym-id": HOSTILE_GYM },
    });

    expect(response.status).toBe(401);
    expect(getGymSettings).not.toHaveBeenCalled();
  });

  it("refuses an unauthenticated request", async () => {
    expect((await app.request("/gym")).status).toBe(401);
  });
});

describe("PATCH /gym", () => {
  it("lets an owner rename the gym and set its hours", async () => {
    const response = await patchGym(
      { name: "ProFit Chilonzor", openTime: "07:00", closeTime: "23:00" },
      { authorization: `Bearer ${owner}` }
    );

    expect(response.status).toBe(200);
    expect(vi.mocked(updateGymSettings).mock.calls.at(-1)?.[0]).toBe(TOKEN_GYM);
    expect(vi.mocked(updateGymSettings).mock.calls.at(-1)?.[2]).toEqual({
      name: "ProFit Chilonzor",
      openTime: "07:00",
      closeTime: "23:00",
    });
  });

  it("keeps a receptionist out", async () => {
    const response = await patchGym(
      { name: "Not theirs to rename" },
      { authorization: `Bearer ${receptionist}` }
    );

    expect(response.status).toBe(403);
    expect(updateGymSettings).not.toHaveBeenCalled();
  });

  it("rejects a time that is not HH:MM", async () => {
    const response = await patchGym(
      { openTime: "7am" },
      { authorization: `Bearer ${owner}` }
    );

    expect(response.status).toBe(400);
    expect(updateGymSettings).not.toHaveBeenCalled();
  });

  it("rejects an empty name rather than blanking the gym", async () => {
    const response = await patchGym(
      { name: "   " },
      { authorization: `Bearer ${owner}` }
    );

    expect(response.status).toBe(400);
    expect(updateGymSettings).not.toHaveBeenCalled();
  });
});

describe("PATCH /auth/password", () => {
  const changeFor = (body: unknown, headers: Record<string, string> = {}) =>
    app.request("/auth/password", {
      method: "PATCH",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

  it("changes the password of whoever the token says is calling", async () => {
    const response = await changeFor(
      { currentPassword: "1111", newPassword: "2222" },
      { authorization: `Bearer ${receptionist}` }
    );

    expect(response.status).toBe(204);
    expect(changePassword).toHaveBeenCalledWith(
      "wkr_000000000000000001",
      "1111",
      "2222"
    );
  });

  it("requires a session — there is no worker id in the body to supply", async () => {
    const response = await changeFor({
      currentPassword: "1111",
      newPassword: "2222",
    });

    expect(response.status).toBe(401);
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("refuses a new password bcrypt would truncate", async () => {
    const response = await changeFor(
      { currentPassword: "1111", newPassword: "x".repeat(73) },
      { authorization: `Bearer ${owner}` }
    );

    expect(response.status).toBe(400);
    expect(changePassword).not.toHaveBeenCalled();
  });
});
