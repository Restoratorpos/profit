import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  listPlans: vi.fn(),
  createPlan: vi.fn(),
  updatePlan: vi.fn(),
  deletePlan: vi.fn(),
  listHalls: vi.fn(),
  createHall: vi.fn(),
  listTrainers: vi.fn(),
}));

vi.mock("../src/services/plan.service.js", () => service);

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

const validPlan = {
  name: "Asosiy a'zolik",
  billingType: "recurring",
  price: "300000",
  duration: 30,
};

beforeEach(() => {
  for (const fn of Object.values(service)) {
    fn.mockReset();
  }
});

describe("GET /plans", () => {
  it("requires a service token", async () => {
    const response = await app.request("/plans");

    expect(response.status).toBe(401);
    expect(service.listPlans).not.toHaveBeenCalled();
  });

  it("scopes to the caller's gym", async () => {
    service.listPlans.mockResolvedValue([]);

    const response = await request("/plans");

    expect(response.status).toBe(200);
    expect(service.listPlans).toHaveBeenCalledWith(GYM);
  });
});

describe("POST /plans", () => {
  it("creates a recurring plan", async () => {
    service.createPlan.mockResolvedValue({ id: "p1" });

    const response = await request("/plans", {
      method: "POST",
      body: JSON.stringify(validPlan),
    });

    expect(response.status).toBe(201);
    expect(service.createPlan).toHaveBeenCalledWith(
      GYM,
      expect.objectContaining({ billingType: "recurring", duration: 30 })
    );
  });

  it("creates a one-time plan", async () => {
    service.createPlan.mockResolvedValue({ id: "p2" });

    const response = await request("/plans", {
      method: "POST",
      body: JSON.stringify({ ...validPlan, billingType: "one_time" }),
    });

    expect(response.status).toBe(201);
  });

  it("rejects an unknown billing type", async () => {
    const response = await request("/plans", {
      method: "POST",
      body: JSON.stringify({ ...validPlan, billingType: "forever" }),
    });

    expect(response.status).toBe(400);
    expect(service.createPlan).not.toHaveBeenCalled();
  });

  it("requires a duration", async () => {
    const response = await request("/plans", {
      method: "POST",
      body: JSON.stringify({
        name: "x",
        billingType: "recurring",
        price: "1",
      }),
    });

    expect(response.status).toBe(400);
  });

  it("accepts an entry limit of 0, which means unlimited", async () => {
    service.createPlan.mockResolvedValue({ id: "p1" });

    const response = await request("/plans", {
      method: "POST",
      body: JSON.stringify({ ...validPlan, entryLimit: 0 }),
    });

    expect(response.status).toBe(201);
    expect(service.createPlan).toHaveBeenCalledWith(
      GYM,
      expect.objectContaining({ entryLimit: 0 })
    );
  });

  it("defaults the entry limit to unlimited", async () => {
    service.createPlan.mockResolvedValue({ id: "p1" });

    await request("/plans", {
      method: "POST",
      body: JSON.stringify(validPlan),
    });

    expect(service.createPlan).toHaveBeenCalledWith(
      GYM,
      expect.objectContaining({ entryLimit: 0, weekdays: [], isActive: true })
    );
  });

  it("accepts a weekday selection", async () => {
    service.createPlan.mockResolvedValue({ id: "p1" });

    await request("/plans", {
      method: "POST",
      body: JSON.stringify({ ...validPlan, weekdays: [1, 3, 5] }),
    });

    expect(service.createPlan).toHaveBeenCalledWith(
      GYM,
      expect.objectContaining({ weekdays: [1, 3, 5] })
    );
  });

  it("rejects a weekday outside 1-7", async () => {
    const response = await request("/plans", {
      method: "POST",
      body: JSON.stringify({ ...validPlan, weekdays: [0, 8] }),
    });

    expect(response.status).toBe(400);
  });

  it("accepts a valid access window", async () => {
    service.createPlan.mockResolvedValue({ id: "p1" });

    const response = await request("/plans", {
      method: "POST",
      body: JSON.stringify({
        ...validPlan,
        accessFrom: "06:00",
        accessTo: "23:59",
      }),
    });

    expect(response.status).toBe(201);
  });

  it("rejects a malformed time", async () => {
    const response = await request("/plans", {
      method: "POST",
      body: JSON.stringify({ ...validPlan, accessFrom: "25:00" }),
    });

    expect(response.status).toBe(400);
  });

  it("normalises money to two decimal places", async () => {
    service.createPlan.mockResolvedValue({ id: "p1" });

    await request("/plans", {
      method: "POST",
      body: JSON.stringify({ ...validPlan, price: 300_000 }),
    });

    expect(service.createPlan).toHaveBeenCalledWith(
      GYM,
      expect.objectContaining({ price: "300000.00" })
    );
  });
});

describe("PATCH /plans/:id", () => {
  it("updates within the caller's gym", async () => {
    service.updatePlan.mockResolvedValue(undefined);

    const response = await request("/plans/p1", {
      method: "PATCH",
      body: JSON.stringify({ ...validPlan, isActive: false }),
    });

    expect(response.status).toBe(204);
    expect(service.updatePlan).toHaveBeenCalledWith(
      GYM,
      "p1",
      expect.objectContaining({ isActive: false })
    );
  });
});

describe("DELETE /plans/:id", () => {
  it("deletes within the caller's gym", async () => {
    service.deletePlan.mockResolvedValue(undefined);

    const response = await request("/plans/p1", { method: "DELETE" });

    expect(response.status).toBe(204);
    expect(service.deletePlan).toHaveBeenCalledWith(GYM, "p1");
  });

  it("surfaces the in-use conflict as 409", async () => {
    const { ConflictError } = await import("../src/lib/errors.js");

    service.deletePlan.mockRejectedValue(
      new ConflictError("This plan is used by existing memberships.")
    );

    const response = await request("/plans/p1", { method: "DELETE" });

    expect(response.status).toBe(409);
  });
});

describe("halls and trainers", () => {
  it("lists halls scoped by gym", async () => {
    service.listHalls.mockResolvedValue([]);

    const response = await request("/halls");

    expect(response.status).toBe(200);
    expect(service.listHalls).toHaveBeenCalledWith(GYM);
  });

  it("creates a hall", async () => {
    service.createHall.mockResolvedValue({ id: "h1", name: "Asosiy zal" });

    const response = await request("/halls", {
      method: "POST",
      body: JSON.stringify({ name: "Asosiy zal" }),
    });

    expect(response.status).toBe(201);
    expect(service.createHall).toHaveBeenCalledWith(GYM, {
      name: "Asosiy zal",
    });
  });

  it("rejects a blank hall name", async () => {
    const response = await request("/halls", {
      method: "POST",
      body: JSON.stringify({ name: "  " }),
    });

    expect(response.status).toBe(400);
  });

  it("lists trainers scoped by gym", async () => {
    service.listTrainers.mockResolvedValue([]);

    const response = await request("/trainers");

    expect(response.status).toBe(200);
    expect(service.listTrainers).toHaveBeenCalledWith(GYM);
  });

  it("requires a service token for halls", async () => {
    const response = await app.request("/halls");

    expect(response.status).toBe(401);
  });
});
