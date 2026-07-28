import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The service layer is mocked: these tests are about the HTTP surface —
 * service-token auth, validation, status codes, and above all that the tenant
 * from the header is what reaches the service. An unscoped call is a data leak,
 * so it is worth asserting rather than assuming.
 */
const service = vi.hoisted(() => ({
  listProducts: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  deleteProduct: vi.fn(),
  listCategories: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
}));

vi.mock("../src/services/catalog.service.js", () => service);

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

beforeEach(() => {
  for (const fn of Object.values(service)) {
    fn.mockReset();
  }
});

describe("service-token auth", () => {
  it("rejects a request with no service token", async () => {
    const response = await app.request("/products");

    expect(response.status).toBe(401);
    expect(service.listProducts).not.toHaveBeenCalled();
  });

  it("rejects a wrong service token", async () => {
    const response = await request("/products", {
      headers: { "x-service-token": "wrong-token-but-right-length" },
    });

    expect(response.status).toBe(401);
    expect(service.listProducts).not.toHaveBeenCalled();
  });

  it("rejects a token of a different length without throwing", async () => {
    // timingSafeEqual throws on unequal lengths; the middleware must not 500.
    const response = await request("/products", {
      headers: { "x-service-token": "short" },
    });

    expect(response.status).toBe(401);
  });

  it("rejects a valid token with no gym header", async () => {
    const response = await app.request("/products", {
      headers: { "x-service-token": TOKEN },
    });

    expect(response.status).toBe(401);
    expect(service.listProducts).not.toHaveBeenCalled();
  });
});

describe("GET /products", () => {
  it("passes the gym from the header straight to the service", async () => {
    service.listProducts.mockResolvedValue([]);

    const response = await request("/products");

    expect(response.status).toBe(200);
    expect(service.listProducts).toHaveBeenCalledWith(GYM);
  });

  it("scopes to whichever gym the caller presents", async () => {
    service.listProducts.mockResolvedValue([]);

    await request("/products", { headers: { "x-gym-id": "other-gym" } });

    expect(service.listProducts).toHaveBeenCalledWith("other-gym");
  });
});

describe("POST /products", () => {
  it("creates and returns 201", async () => {
    service.createProduct.mockResolvedValue({ id: "p1", name: "Water" });

    const response = await request("/products", {
      method: "POST",
      body: JSON.stringify({ name: "Water", price: "10000", cost: "5000" }),
    });

    expect(response.status).toBe(201);
    expect(service.createProduct).toHaveBeenCalledWith(
      GYM,
      expect.objectContaining({ name: "Water" })
    );
  });

  it("normalises money to two decimal places", async () => {
    service.createProduct.mockResolvedValue({ id: "p1" });

    await request("/products", {
      method: "POST",
      body: JSON.stringify({ name: "Water", price: 10_000, cost: "5000.5" }),
    });

    expect(service.createProduct).toHaveBeenCalledWith(
      GYM,
      expect.objectContaining({ price: "10000.00", cost: "5000.50" })
    );
  });

  it("defaults productType to shop", async () => {
    service.createProduct.mockResolvedValue({ id: "p1" });

    await request("/products", {
      method: "POST",
      body: JSON.stringify({ name: "Water", price: "1", cost: "1" }),
    });

    expect(service.createProduct).toHaveBeenCalledWith(
      GYM,
      expect.objectContaining({ productType: "shop" })
    );
  });

  it("accepts ingredient as a product type", async () => {
    service.createProduct.mockResolvedValue({ id: "p1" });

    const response = await request("/products", {
      method: "POST",
      body: JSON.stringify({
        name: "Milk",
        price: "0",
        cost: "12000",
        productType: "ingredient",
        unit: "l",
      }),
    });

    expect(response.status).toBe(201);
    expect(service.createProduct).toHaveBeenCalledWith(
      GYM,
      expect.objectContaining({ productType: "ingredient", unit: "l" })
    );
  });

  it("rejects a product type outside the vocabulary with 400", async () => {
    const response = await request("/products", {
      method: "POST",
      body: JSON.stringify({
        name: "Milk",
        price: "1",
        cost: "1",
        productType: "raw",
      }),
    });

    expect(response.status).toBe(400);
    expect(service.createProduct).not.toHaveBeenCalled();
  });

  it("rejects a missing name with 400", async () => {
    const response = await request("/products", {
      method: "POST",
      body: JSON.stringify({ price: "1", cost: "1" }),
    });

    expect(response.status).toBe(400);
    expect(service.createProduct).not.toHaveBeenCalled();
  });

  it("rejects a negative price with 400", async () => {
    const response = await request("/products", {
      method: "POST",
      body: JSON.stringify({ name: "Water", price: "-1", cost: "1" }),
    });

    expect(response.status).toBe(400);
  });
});

describe("PATCH /products/:id", () => {
  it("updates and returns 204", async () => {
    service.updateProduct.mockResolvedValue(undefined);

    const response = await request("/products/p1", {
      method: "PATCH",
      body: JSON.stringify({ name: "Still water" }),
    });

    expect(response.status).toBe(204);
    expect(service.updateProduct).toHaveBeenCalledWith(GYM, "p1", {
      name: "Still water",
    });
  });

  it("rejects an empty update with 400", async () => {
    const response = await request("/products/p1", {
      method: "PATCH",
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
    expect(service.updateProduct).not.toHaveBeenCalled();
  });
});

describe("DELETE /products/:id", () => {
  it("deletes within the caller's gym and returns 204", async () => {
    service.deleteProduct.mockResolvedValue(undefined);

    const response = await request("/products/p1", { method: "DELETE" });

    expect(response.status).toBe(204);
    expect(service.deleteProduct).toHaveBeenCalledWith(GYM, "p1");
  });
});

describe("categories", () => {
  it("lists scoped by gym", async () => {
    service.listCategories.mockResolvedValue([]);

    const response = await request("/categories");

    expect(response.status).toBe(200);
    expect(service.listCategories).toHaveBeenCalledWith(GYM);
  });

  it("creates and returns 201", async () => {
    service.createCategory.mockResolvedValue({ id: "c1", name: "Drinks" });

    const response = await request("/categories", {
      method: "POST",
      body: JSON.stringify({ name: "Drinks" }),
    });

    expect(response.status).toBe(201);
    expect(service.createCategory).toHaveBeenCalledWith(GYM, {
      name: "Drinks",
    });
  });

  it("rejects a blank name with 400", async () => {
    const response = await request("/categories", {
      method: "POST",
      body: JSON.stringify({ name: "   " }),
    });

    expect(response.status).toBe(400);
    expect(service.createCategory).not.toHaveBeenCalled();
  });

  it("deletes within the caller's gym", async () => {
    service.deleteCategory.mockResolvedValue(undefined);

    const response = await request("/categories/c1", { method: "DELETE" });

    expect(response.status).toBe(204);
    expect(service.deleteCategory).toHaveBeenCalledWith(GYM, "c1");
  });

  it("renames within the caller's gym and returns the row", async () => {
    service.updateCategory.mockResolvedValue({ id: "c1", name: "Suvlar" });

    const response = await request("/categories/c1", {
      method: "PATCH",
      body: JSON.stringify({ name: "Suvlar" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: "c1",
      name: "Suvlar",
    });
    expect(service.updateCategory).toHaveBeenCalledWith(GYM, "c1", {
      name: "Suvlar",
    });
  });

  it("rejects a rename to a blank name with 400", async () => {
    const response = await request("/categories/c1", {
      method: "PATCH",
      body: JSON.stringify({ name: "  " }),
    });

    expect(response.status).toBe(400);
    expect(service.updateCategory).not.toHaveBeenCalled();
  });

  it("cannot rename another gym's category", async () => {
    service.updateCategory.mockResolvedValue({ id: "c1", name: "x" });

    await request("/categories/c1", {
      method: "PATCH",
      body: JSON.stringify({ name: "x" }),
      headers: { "x-gym-id": "other-gym" },
    });

    // The service decides; the route must not smuggle a different tenant.
    expect(service.updateCategory).toHaveBeenCalledWith("other-gym", "c1", {
      name: "x",
    });
  });
});
