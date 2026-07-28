import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  spreadDeliveryDebt,
  stockStatusOf,
} from "../src/services/inventory.service.js";

/**
 * Two halves. The HTTP surface is tested against a mocked service — tenant
 * scoping, validation, status codes. The debt split is tested for real, because
 * it is the one calculation on these screens that quietly gets money wrong.
 */
const service = vi.hoisted(() => ({
  createStockAction: vi.fn(),
  createStocktake: vi.fn(),
  createSupplier: vi.fn(),
  deleteSupplier: vi.fn(),
  listMovements: vi.fn(),
  listStock: vi.fn(),
  listSuppliers: vi.fn(),
  paySupplier: vi.fn(),
  updateSupplier: vi.fn(),
  voidStockAction: vi.fn(),
}));

vi.mock("../src/services/inventory.service.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../src/services/inventory.service.js")
    >();

  // The pure helpers stay real; only the db-touching entry points are stubbed.
  return { ...actual, ...service };
});

const { app } = await import("../src/app.js");

const TOKEN = "test-service-token-at-least-16";
const GYM = "gym_00000000000000001";
const WORKER = "wrk_0000000000000001";
const PRODUCT = "prd_0000000000000001";

const request = (
  path: string,
  init: RequestInit & { headers?: Record<string, string> } = {}
) =>
  app.request(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-gym-id": GYM,
      "x-service-token": TOKEN,
      "x-worker-id": WORKER,
      ...init.headers,
    },
  });

const post = (path: string, body: unknown) =>
  request(path, { body: JSON.stringify(body), method: "POST" });

beforeEach(() => {
  for (const fn of Object.values(service)) {
    fn.mockReset();
  }
});

describe("service-token auth", () => {
  it("rejects a request with no service token", async () => {
    const response = await app.request("/inventory");

    expect(response.status).toBe(401);
    expect(service.listStock).not.toHaveBeenCalled();
  });

  it("rejects a valid token with no gym header", async () => {
    const response = await app.request("/inventory", {
      headers: { "x-service-token": TOKEN },
    });

    expect(response.status).toBe(401);
    expect(service.listStock).not.toHaveBeenCalled();
  });
});

describe("GET /inventory", () => {
  it("passes the gym from the header straight to the service", async () => {
    service.listStock.mockResolvedValue([]);

    const response = await request("/inventory");

    expect(response.status).toBe(200);
    expect(service.listStock).toHaveBeenCalledWith(GYM);
  });
});

describe("GET /inventory/movements", () => {
  it("defaults the limit rather than reading the whole ledger", async () => {
    service.listMovements.mockResolvedValue([]);

    await request("/inventory/movements");

    expect(service.listMovements).toHaveBeenCalledWith(
      GYM,
      expect.objectContaining({ limit: 100 })
    );
  });

  it("passes a product and action filter through", async () => {
    service.listMovements.mockResolvedValue([]);

    await request(
      `/inventory/movements?productId=${PRODUCT}&actionType=in&limit=5`
    );

    expect(service.listMovements).toHaveBeenCalledWith(GYM, {
      actionType: "in",
      limit: 5,
      productId: PRODUCT,
    });
  });

  it("rejects an action type that is not a document type", async () => {
    const response = await request("/inventory/movements?actionType=sale");

    expect(response.status).toBe(400);
    expect(service.listMovements).not.toHaveBeenCalled();
  });
});

describe("POST /inventory/actions", () => {
  const delivery = {
    actionType: "in",
    items: [{ productId: PRODUCT, quantity: 10, unitCost: 5000 }],
    supplierId: "sup_000000000001",
  };

  it("creates a delivery and answers 201", async () => {
    service.createStockAction.mockResolvedValue({
      id: "act_1",
      quantity: "10.000",
      total: "50000.00",
    });

    const response = await post("/inventory/actions", delivery);

    expect(response.status).toBe(201);
    expect(service.createStockAction).toHaveBeenCalledWith(
      GYM,
      expect.objectContaining({ actionType: "in" }),
      WORKER
    );
  });

  it("normalises money and quantity to the column scale", async () => {
    service.createStockAction.mockResolvedValue({
      id: "act_1",
      quantity: "1.500",
      total: "0.00",
    });

    await post("/inventory/actions", {
      actionType: "in",
      items: [{ productId: PRODUCT, quantity: 1.5, unitCost: 1234.567 }],
    });

    const [, input] = service.createStockAction.mock.calls[0];

    expect(input.items[0]).toEqual({
      productId: PRODUCT,
      quantity: "1.500",
      unitCost: "1234.57",
    });
  });

  it("refuses a document with no lines", async () => {
    const response = await post("/inventory/actions", {
      actionType: "writeoff",
      items: [],
    });

    expect(response.status).toBe(400);
    expect(service.createStockAction).not.toHaveBeenCalled();
  });

  it("refuses a negative quantity — direction comes from the action, not the sign", async () => {
    const response = await post("/inventory/actions", {
      actionType: "writeoff",
      items: [{ productId: PRODUCT, quantity: -3 }],
    });

    expect(response.status).toBe(400);
    expect(service.createStockAction).not.toHaveBeenCalled();
  });

  it("refuses a stocktake through the actions endpoint", async () => {
    const response = await post("/inventory/actions", {
      actionType: "stocktake",
      items: [{ productId: PRODUCT, quantity: 1 }],
    });

    expect(response.status).toBe(400);
    expect(service.createStockAction).not.toHaveBeenCalled();
  });
});

describe("POST /inventory/stocktakes", () => {
  it("accepts a counted quantity of zero — the shelf can be empty", async () => {
    service.createStocktake.mockResolvedValue({
      id: "act_1",
      quantity: "-2.000",
      total: "0.00",
    });

    const response = await post("/inventory/stocktakes", {
      items: [{ counted: 0, productId: PRODUCT }],
    });

    expect(response.status).toBe(201);
    expect(service.createStocktake).toHaveBeenCalledWith(
      GYM,
      { items: [{ counted: "0.000", productId: PRODUCT }] },
      WORKER
    );
  });
});

describe("suppliers", () => {
  it("requires a name", async () => {
    const response = await post("/suppliers", { phone: "998901234567" });

    expect(response.status).toBe(400);
    expect(service.createSupplier).not.toHaveBeenCalled();
  });

  it("creates one and answers 201", async () => {
    service.createSupplier.mockResolvedValue({ id: "sup_1" });

    const response = await post("/suppliers", { supplier: "Ali MChJ" });

    expect(response.status).toBe(201);
    expect(service.createSupplier).toHaveBeenCalledWith(GYM, {
      supplier: "Ali MChJ",
    });
  });

  it("refuses a payment of zero", async () => {
    const response = await post("/suppliers/sup_1/pay", {
      amount: 0,
      method: "cash",
    });

    expect(response.status).toBe(400);
    expect(service.paySupplier).not.toHaveBeenCalled();
  });

  it("carries the worker through to the payment", async () => {
    service.paySupplier.mockResolvedValue({ id: "sup_1" });

    const response = await post("/suppliers/sup_1/pay", {
      amount: 25_000,
      method: "cash",
    });

    expect(response.status).toBe(200);
    expect(service.paySupplier).toHaveBeenCalledWith(
      GYM,
      "sup_1",
      { amount: "25000.00", method: "cash" },
      WORKER
    );
  });
});

describe("stockStatusOf", () => {
  it("calls nothing on the shelf out, however it got there", () => {
    expect(stockStatusOf(0)).toBe("out");
    expect(stockStatusOf(-158.7)).toBe("out");
  });

  it("warns below the threshold and stays quiet above it", () => {
    expect(stockStatusOf(1.65)).toBe("low");
    expect(stockStatusOf(4.999)).toBe("low");
    expect(stockStatusOf(5)).toBe("in");
    expect(stockStatusOf(40)).toBe("in");
  });
});

describe("spreadDeliveryDebt", () => {
  it("splits what is owed by line value", () => {
    const debt = spreadDeliveryDebt(
      [{ id: "act_1", remaining: 300_000 }],
      [
        { actionId: "act_1", productId: "a", value: 300_000 },
        { actionId: "act_1", productId: "b", value: 200_000 },
      ]
    );

    expect(debt.get("a")).toBeCloseTo(180_000, 6);
    expect(debt.get("b")).toBeCloseTo(120_000, 6);
  });

  it("adds up to the total owed, which is the whole point of the column", () => {
    const deliveries = [
      { id: "act_1", remaining: 300_000 },
      { id: "act_2", remaining: 125_500 },
    ];
    const debt = spreadDeliveryDebt(deliveries, [
      { actionId: "act_1", productId: "a", value: 300_000 },
      { actionId: "act_1", productId: "b", value: 200_000 },
      { actionId: "act_2", productId: "b", value: 10 },
      { actionId: "act_2", productId: "c", value: 30 },
    ]);

    const summed = [...debt.values()].reduce(
      (total, value) => total + value,
      0
    );

    expect(summed).toBeCloseTo(425_500, 6);
  });

  it("accumulates a product that arrived on more than one delivery", () => {
    const debt = spreadDeliveryDebt(
      [
        { id: "act_1", remaining: 100 },
        { id: "act_2", remaining: 50 },
      ],
      [
        { actionId: "act_1", productId: "a", value: 1 },
        { actionId: "act_2", productId: "a", value: 1 },
      ]
    );

    expect(debt.get("a")).toBeCloseTo(150, 6);
  });

  it("ignores a delivery that is fully paid", () => {
    const debt = spreadDeliveryDebt(
      [{ id: "act_1", remaining: 0 }],
      [{ actionId: "act_1", productId: "a", value: 500 }]
    );

    expect(debt.size).toBe(0);
  });

  it("splits evenly when the lines are worth nothing, rather than losing the money", () => {
    const debt = spreadDeliveryDebt(
      [{ id: "act_1", remaining: 90 }],
      [
        { actionId: "act_1", productId: "a", value: 0 },
        { actionId: "act_1", productId: "b", value: 0 },
        { actionId: "act_1", productId: "c", value: 0 },
      ]
    );

    expect(debt.get("a")).toBeCloseTo(30, 6);
    expect(
      [...debt.values()].reduce((sum, value) => sum + value, 0)
    ).toBeCloseTo(90, 6);
  });

  it("attributes nothing for a delivery whose lines were never recorded", () => {
    const debt = spreadDeliveryDebt([{ id: "act_1", remaining: 90 }], []);

    expect(debt.size).toBe(0);
  });
});
