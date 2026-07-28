import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The middleware matrix for `requireCaller`, exercised through a real route.
 *
 * /categories is used because its handler is a single line that forwards
 * `c.get("gymId")` straight to a service — so asserting what the service was
 * called with is the same as asserting which tenant the request was scoped to,
 * with nothing in between to muddy it.
 */
vi.mock("../src/services/catalog.service.js", () => ({
  listCategories: vi.fn(() => Promise.resolve([])),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
  listProducts: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  deleteProduct: vi.fn(),
}));

const { app } = await import("../src/app.js");
const { signAccessToken, signRefreshToken } = await import("../src/lib/jwt.js");
const { listCategories } = await import("../src/services/catalog.service.js");

const TOKEN_GYM = "gym_from_the_token";
const HOSTILE_GYM = "gym_belonging_to_someone_else";
const SERVICE_TOKEN = "test-service-token-at-least-16";

const accessToken = signAccessToken({
  id: "wkr_000000000000000001",
  phone: "998907661770",
  name: "Owner",
  role: "owner",
  gymId: TOKEN_GYM,
  branchId: "brn_00000000000000001",
});

const getCategories = (headers: Record<string, string>) =>
  app.request("/categories", { headers });

/** The tenant the handler actually scoped to on the most recent request. */
const scopedGym = (): unknown =>
  vi.mocked(listCategories).mock.calls.at(-1)?.[0];

beforeEach(() => {
  vi.mocked(listCategories).mockClear();
});

describe("requireCaller — bearer token", () => {
  it("accepts a valid access token and scopes to the gym in its claims", async () => {
    const response = await getCategories({
      authorization: `Bearer ${accessToken}`,
    });

    expect(response.status).toBe(200);
    expect(scopedGym()).toBe(TOKEN_GYM);
  });

  /**
   * The reason this migration exists. Under the service token the tenant is a
   * request header, so whoever holds the token names any gym they like. Under a
   * bearer token it is a signed claim, and the header must be inert — if this
   * ever fails, one gym can read another's data by editing a request.
   */
  it("ignores x-gym-id entirely when a bearer token is present", async () => {
    const response = await getCategories({
      authorization: `Bearer ${accessToken}`,
      "x-gym-id": HOSTILE_GYM,
    });

    expect(response.status).toBe(200);
    expect(scopedGym()).toBe(TOKEN_GYM);
    expect(scopedGym()).not.toBe(HOSTILE_GYM);
  });

  it("rejects an expired or tampered token instead of falling back to the service token", async () => {
    const response = await getCategories({
      authorization: "Bearer not-a-real-token",
      // Present, valid, and deliberately ignored: a browser holding a stale
      // session must not be silently upgraded to service-level trust by a
      // header some proxy added.
      "x-service-token": SERVICE_TOKEN,
      "x-gym-id": HOSTILE_GYM,
    });

    expect(response.status).toBe(401);
    expect(listCategories).not.toHaveBeenCalled();
  });

  it("rejects a refresh token presented as an access token", async () => {
    const response = await getCategories({
      authorization: `Bearer ${signRefreshToken("wkr_000000000000000001")}`,
    });

    expect(response.status).toBe(401);
    expect(listCategories).not.toHaveBeenCalled();
  });

  it("rejects an Authorization header that is not a bearer scheme", async () => {
    const response = await getCategories({ authorization: "Basic abc123" });

    expect(response.status).toBe(401);
  });
});

describe("requireCaller — service token (apps/app, until Phase 5)", () => {
  it("still accepts the shared token with an explicit gym", async () => {
    const response = await getCategories({
      "x-service-token": SERVICE_TOKEN,
      "x-gym-id": "gym_00000000000000001",
    });

    expect(response.status).toBe(200);
    expect(scopedGym()).toBe("gym_00000000000000001");
  });

  it("refuses the shared token without a gym to scope to", async () => {
    const response = await getCategories({
      "x-service-token": SERVICE_TOKEN,
    });

    expect(response.status).toBe(401);
    expect(listCategories).not.toHaveBeenCalled();
  });

  it("refuses a wrong shared token", async () => {
    const response = await getCategories({
      "x-service-token": "wrong-token-but-right-length",
      "x-gym-id": "gym_00000000000000001",
    });

    expect(response.status).toBe(401);
  });
});

describe("requireCaller — no credentials", () => {
  it("refuses an unauthenticated request", async () => {
    const response = await getCategories({});

    expect(response.status).toBe(401);
    expect(listCategories).not.toHaveBeenCalled();
  });
});
