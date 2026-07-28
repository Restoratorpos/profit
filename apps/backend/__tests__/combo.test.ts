import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The service is mocked: these tests cover the HTTP surface — service-token
 * auth, validation, status codes, and that the tenant from the header is what
 * reaches the service. An unscoped call is a data leak, so it is asserted.
 */
const service = vi.hoisted(() => ({
  listCombos: vi.fn(),
  createCombo: vi.fn(),
  updateCombo: vi.fn(),
  deleteCombo: vi.fn(),
}));

vi.mock("../src/services/combo.service.js", () => service);

const { app } = await import("../src/app.js");

const TOKEN = "test-service-token-at-least-16";
const GYM = "gym_00000000000000001";

const request = (
  path: string,
  init: RequestInit & { headers?: Record<string, string> } = {}
) =>
  app.request(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-service-token": TOKEN,
      "x-gym-id": GYM,
      ...init.headers,
    },
  });

const validCombo = {
  name: "Protein Shake",
  price: "10000",
  productType: "bar",
  components: [
    { productId: "prod0000000000000001", quantity: "0.05" },
    { productId: "prod0000000000000002", quantity: "1" },
  ],
};

beforeEach(() => {
  for (const fn of Object.values(service)) {
    fn.mockReset();
  }
});

describe("service-token auth", () => {
  it("rejects a request with no service token", async () => {
    const response = await app.request("/combos");

    expect(response.status).toBe(401);
    expect(service.listCombos).not.toHaveBeenCalled();
  });

  it("rejects a valid token with no gym header", async () => {
    const response = await app.request("/combos", {
      headers: { "x-service-token": TOKEN },
    });

    expect(response.status).toBe(401);
    expect(service.listCombos).not.toHaveBeenCalled();
  });
});

describe("GET /combos", () => {
  it("passes the gym from the header straight to the service", async () => {
    service.listCombos.mockResolvedValue([]);

    const response = await request("/combos");

    expect(response.status).toBe(200);
    expect(service.listCombos).toHaveBeenCalledWith(GYM);
  });
});

describe("POST /combos", () => {
  it("creates and returns 201", async () => {
    service.createCombo.mockResolvedValue({
      id: "combo1",
      name: "Protein Shake",
    });

    const response = await request("/combos", {
      method: "POST",
      body: JSON.stringify(validCombo),
    });

    expect(response.status).toBe(201);
    expect(service.createCombo).toHaveBeenCalledWith(
      GYM,
      expect.objectContaining({ name: "Protein Shake", productType: "bar" })
    );
  });

  it("normalises price and quantities to two decimal places", async () => {
    service.createCombo.mockResolvedValue({ id: "combo1" });

    await request("/combos", {
      method: "POST",
      body: JSON.stringify({
        name: "Shake",
        price: 10_000,
        components: [{ productId: "prod0000000000000001", quantity: 0.05 }],
      }),
    });

    const [, input] = service.createCombo.mock.calls[0];

    expect(input.price).toBe("10000.00");
    expect(input.components[0].quantity).toBe("0.05");
  });

  it("defaults productType to shop", async () => {
    service.createCombo.mockResolvedValue({ id: "combo1" });

    await request("/combos", {
      method: "POST",
      body: JSON.stringify({
        name: "Shake",
        price: "1",
        components: [{ productId: "prod0000000000000001", quantity: "1" }],
      }),
    });

    expect(service.createCombo).toHaveBeenCalledWith(
      GYM,
      expect.objectContaining({ productType: "shop" })
    );
  });

  it("rejects a combo with no components", async () => {
    const response = await request("/combos", {
      method: "POST",
      body: JSON.stringify({ name: "Shake", price: "1", components: [] }),
    });

    expect(response.status).toBe(400);
    expect(service.createCombo).not.toHaveBeenCalled();
  });

  it("rejects a component with a non-positive quantity", async () => {
    const response = await request("/combos", {
      method: "POST",
      body: JSON.stringify({
        name: "Shake",
        price: "1",
        components: [{ productId: "prod0000000000000001", quantity: "0" }],
      }),
    });

    expect(response.status).toBe(400);
  });

  it("rejects a missing name", async () => {
    const response = await request("/combos", {
      method: "POST",
      body: JSON.stringify({
        price: "1",
        components: [{ productId: "prod0000000000000001", quantity: "1" }],
      }),
    });

    expect(response.status).toBe(400);
  });
});

describe("PUT /combos/:id", () => {
  it("replaces and returns the updated combo", async () => {
    service.updateCombo.mockResolvedValue({
      id: "combo1",
      name: "Protein Shake",
    });

    const response = await request("/combos/combo1", {
      method: "PUT",
      body: JSON.stringify(validCombo),
    });

    expect(response.status).toBe(200);
    expect(service.updateCombo).toHaveBeenCalledWith(
      GYM,
      "combo1",
      expect.objectContaining({ name: "Protein Shake" })
    );
  });

  it("rejects an update with no components", async () => {
    const response = await request("/combos/combo1", {
      method: "PUT",
      body: JSON.stringify({ name: "Shake", price: "1", components: [] }),
    });

    expect(response.status).toBe(400);
    expect(service.updateCombo).not.toHaveBeenCalled();
  });
});

describe("DELETE /combos/:id", () => {
  it("deletes within the caller's gym and returns 204", async () => {
    service.deleteCombo.mockResolvedValue(undefined);

    const response = await request("/combos/combo1", { method: "DELETE" });

    expect(response.status).toBe(204);
    expect(service.deleteCombo).toHaveBeenCalledWith(GYM, "combo1");
  });
});
