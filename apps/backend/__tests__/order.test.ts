import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  listMemberOrderDebts: vi.fn(),
  getMemberOrderDetail: vi.fn(),
  payMemberOrders: vi.fn(),
  createOrder: vi.fn(),
  editMemberOrderItems: vi.fn(),
  voidMemberOrders: vi.fn(),
}));

vi.mock("../src/services/order.service.js", () => service);

const { app } = await import("../src/app.js");

const TOKEN = "test-service-token-at-least-16";
const GYM = "gym_00000000000000001";
const WORKER = "wkr_00000000000000001";
const MEMBER = "mbr_00000000000000001";

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
      "x-worker-id": WORKER,
      ...init.headers,
    },
  });

beforeEach(() => {
  for (const fn of Object.values(service)) {
    fn.mockReset();
  }
});

describe("GET /orders", () => {
  it("requires a service token", async () => {
    const response = await app.request("/orders");

    expect(response.status).toBe(401);
    expect(service.listMemberOrderDebts).not.toHaveBeenCalled();
  });

  it("returns one debt line per buyer, scoped to the gym", async () => {
    service.listMemberOrderDebts.mockResolvedValue([
      {
        id: MEMBER,
        name: "Mirzohid",
        remaining: "400000.00",
        userType: "member",
      },
    ]);

    const response = await request("/orders");

    expect(response.status).toBe(200);
    expect(service.listMemberOrderDebts).toHaveBeenCalledWith(GYM);
  });

  it("carries the buyer type so the list can tell staff from members", async () => {
    service.listMemberOrderDebts.mockResolvedValue([
      { id: MEMBER, name: "Mirzohid", remaining: "0.00", userType: "member" },
      { id: WORKER, name: "Aziza", remaining: "50000.00", userType: "worker" },
    ]);

    const response = await request("/orders");
    const body = (await response.json()) as { userType: string }[];

    expect(body.map((row) => row.userType)).toEqual(["member", "worker"]);
  });
});

describe("POST /orders", () => {
  const walkInSale = {
    userId: null,
    items: [{ productId: "prod_00000000000001", quantity: 2 }],
    payments: [{ method: "cash" }],
  };

  it("rings up a sale and returns 201 with the operator attributed", async () => {
    service.createOrder.mockResolvedValue({ id: "ord_1", total: "20000.00" });

    const response = await request("/orders", {
      method: "POST",
      body: JSON.stringify(walkInSale),
    });

    expect(response.status).toBe(201);
    expect(service.createOrder).toHaveBeenCalledWith(
      GYM,
      expect.objectContaining({ payments: [{ method: "cash" }] }),
      WORKER
    );
  });

  it("rejects a sale with no items", async () => {
    const response = await request("/orders", {
      method: "POST",
      body: JSON.stringify({ ...walkInSale, items: [] }),
    });

    expect(response.status).toBe(400);
    expect(service.createOrder).not.toHaveBeenCalled();
  });

  it("rejects a fractional quantity", async () => {
    const response = await request("/orders", {
      method: "POST",
      body: JSON.stringify({
        ...walkInSale,
        items: [{ productId: "prod_00000000000001", quantity: 1.5 }],
      }),
    });

    expect(response.status).toBe(400);
  });

  it("rejects an unknown checkout type", async () => {
    const response = await request("/orders", {
      method: "POST",
      body: JSON.stringify({
        ...walkInSale,
        payments: [{ method: "voucher" }],
      }),
    });

    expect(response.status).toBe(400);
    expect(service.createOrder).not.toHaveBeenCalled();
  });

  it("accepts a comp — nothing charged, nothing owed", async () => {
    service.createOrder.mockResolvedValue({ id: "ord_1", total: "20000.00" });

    const response = await request("/orders", {
      method: "POST",
      body: JSON.stringify({ ...walkInSale, payments: [{ method: "free" }] }),
    });

    expect(response.status).toBe(201);
    expect(service.createOrder).toHaveBeenCalledWith(
      GYM,
      expect.objectContaining({ payments: [{ method: "free" }] }),
      WORKER
    );
  });

  it("accepts a combo line and passes it through", async () => {
    service.createOrder.mockResolvedValue({ id: "ord_1", total: "10000.00" });

    const response = await request("/orders", {
      method: "POST",
      body: JSON.stringify({
        ...walkInSale,
        items: [{ comboId: "combo00000000001", quantity: 1 }],
      }),
    });

    expect(response.status).toBe(201);

    const [, input] = service.createOrder.mock.calls[0];

    expect(input.items[0]).toEqual({
      comboId: "combo00000000001",
      quantity: 1,
    });
  });

  it("rejects an item that is both a product and a combo", async () => {
    const response = await request("/orders", {
      method: "POST",
      body: JSON.stringify({
        ...walkInSale,
        items: [
          {
            productId: "prod_00000000000001",
            comboId: "combo00000000001",
            quantity: 1,
          },
        ],
      }),
    });

    expect(response.status).toBe(400);
    expect(service.createOrder).not.toHaveBeenCalled();
  });

  it("rejects an item that is neither a product nor a combo", async () => {
    const response = await request("/orders", {
      method: "POST",
      body: JSON.stringify({ ...walkInSale, items: [{ quantity: 1 }] }),
    });

    expect(response.status).toBe(400);
    expect(service.createOrder).not.toHaveBeenCalled();
  });

  it("surfaces a walk-in-on-credit refusal as 400", async () => {
    const { BadRequestError } = await import("../src/lib/errors.js");

    service.createOrder.mockRejectedValue(
      new BadRequestError("A walk-in sale must be paid at checkout")
    );

    const response = await request("/orders", {
      method: "POST",
      body: JSON.stringify({ ...walkInSale, payments: [{ method: "debt" }] }),
    });

    expect(response.status).toBe(400);
  });
});

describe("GET /orders/member/:userId", () => {
  it("passes the gym and member id through", async () => {
    service.getMemberOrderDetail.mockResolvedValue({
      member: { id: MEMBER, name: "Mirzohid", phone: null },
      orders: [],
      total: "0.00",
      paid: "0.00",
      remaining: "0.00",
    });

    const response = await request(`/orders/member/${MEMBER}`);

    expect(response.status).toBe(200);
    expect(service.getMemberOrderDetail).toHaveBeenCalledWith(GYM, MEMBER);
  });

  it("surfaces an unknown member as 404", async () => {
    const { NotFoundError } = await import("../src/lib/errors.js");

    service.getMemberOrderDetail.mockRejectedValue(
      new NotFoundError("Member not found")
    );

    const response = await request(`/orders/member/${MEMBER}`);

    expect(response.status).toBe(404);
  });
});

describe("POST /orders/member/:userId/pay", () => {
  it("records a cash payment for the whole balance", async () => {
    service.payMemberOrders.mockResolvedValue({ remaining: "0.00" });

    const response = await request(`/orders/member/${MEMBER}/pay`, {
      method: "POST",
      body: JSON.stringify({ amount: "300000", paymentType: "cash" }),
    });

    expect(response.status).toBe(200);
    expect(service.payMemberOrders).toHaveBeenCalledWith(
      GYM,
      MEMBER,
      { amount: "300000.00", paymentType: "cash" },
      WORKER
    );
  });

  it("normalises the amount to two decimal places", async () => {
    service.payMemberOrders.mockResolvedValue({ remaining: "0.00" });

    await request(`/orders/member/${MEMBER}/pay`, {
      method: "POST",
      body: JSON.stringify({ amount: 50_000, paymentType: "card" }),
    });

    expect(service.payMemberOrders).toHaveBeenCalledWith(
      GYM,
      MEMBER,
      { amount: "50000.00", paymentType: "card" },
      WORKER
    );
  });

  it("rejects a zero amount", async () => {
    const response = await request(`/orders/member/${MEMBER}/pay`, {
      method: "POST",
      body: JSON.stringify({ amount: "0", paymentType: "cash" }),
    });

    expect(response.status).toBe(400);
    expect(service.payMemberOrders).not.toHaveBeenCalled();
  });

  it("rejects a negative amount", async () => {
    const response = await request(`/orders/member/${MEMBER}/pay`, {
      method: "POST",
      body: JSON.stringify({ amount: "-100", paymentType: "cash" }),
    });

    expect(response.status).toBe(400);
  });

  it("rejects debt and free — those are not ways to clear a debt", async () => {
    for (const paymentType of ["debt", "free"]) {
      const response = await request(`/orders/member/${MEMBER}/pay`, {
        method: "POST",
        body: JSON.stringify({ amount: "100", paymentType }),
      });

      expect(response.status).toBe(400);
    }

    expect(service.payMemberOrders).not.toHaveBeenCalled();
  });

  it("surfaces a settled balance as 409", async () => {
    const { ConflictError } = await import("../src/lib/errors.js");

    service.payMemberOrders.mockRejectedValue(
      new ConflictError("No outstanding balance")
    );

    const response = await request(`/orders/member/${MEMBER}/pay`, {
      method: "POST",
      body: JSON.stringify({ amount: "100", paymentType: "cash" }),
    });

    expect(response.status).toBe(409);
  });
});

describe("PATCH /orders/member/:userId/items", () => {
  const LINE = "orep0000000000000001";
  const detail = { paid: "0.00", remaining: "0.00", total: "0.00" };

  const edit = (body: unknown) =>
    request(`/orders/member/${MEMBER}/items`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });

  it("passes line quantities and additions through with the operator", async () => {
    service.editMemberOrderItems.mockResolvedValue(detail);

    const response = await edit({
      lines: [{ id: LINE, quantity: 5 }],
      added: [{ productId: "prod_00000000000001", quantity: 2 }],
    });

    expect(response.status).toBe(200);
    expect(service.editMemberOrderItems).toHaveBeenCalledWith(
      GYM,
      MEMBER,
      {
        lines: [{ id: LINE, quantity: 5 }],
        added: [{ productId: "prod_00000000000001", quantity: 2 }],
      },
      WORKER
    );
  });

  it("carries the removal reason and disposition through", async () => {
    service.editMemberOrderItems.mockResolvedValue(detail);

    const response = await edit({
      lines: [
        {
          id: LINE,
          quantity: 0,
          reason: "damaged",
          disposition: "wasted",
        },
      ],
    });

    expect(response.status).toBe(200);

    const [, , input] = service.editMemberOrderItems.mock.calls[0];

    expect(input.lines[0]).toEqual({
      id: LINE,
      quantity: 0,
      reason: "damaged",
      disposition: "wasted",
    });
  });

  it("accepts quantity zero — that is how a line is removed", async () => {
    service.editMemberOrderItems.mockResolvedValue(detail);

    const response = await edit({
      lines: [
        { id: LINE, quantity: 0, reason: "other", disposition: "returned" },
      ],
    });

    expect(response.status).toBe(200);
  });

  it("rejects an unknown reason or disposition", async () => {
    for (const line of [
      { id: LINE, quantity: 0, reason: "stolen", disposition: "wasted" },
      { id: LINE, quantity: 0, reason: "damaged", disposition: "binned" },
    ]) {
      const response = await edit({ lines: [line] });

      expect(response.status).toBe(400);
    }

    expect(service.editMemberOrderItems).not.toHaveBeenCalled();
  });

  it("surfaces an unexplained reduction as 400", async () => {
    const { BadRequestError } = await import("../src/lib/errors.js");

    service.editMemberOrderItems.mockRejectedValue(
      new BadRequestError("Removing units needs a reason and a disposition")
    );

    const response = await edit({ lines: [{ id: LINE, quantity: 1 }] });

    expect(response.status).toBe(400);
  });

  it("rejects a body that changes nothing", async () => {
    const response = await edit({ lines: [], added: [] });

    expect(response.status).toBe(400);
    expect(service.editMemberOrderItems).not.toHaveBeenCalled();
  });

  it("rejects the same line twice — one of the two would be lost", async () => {
    const response = await edit({
      lines: [
        { id: LINE, quantity: 1 },
        { id: LINE, quantity: 4 },
      ],
    });

    expect(response.status).toBe(400);
    expect(service.editMemberOrderItems).not.toHaveBeenCalled();
  });

  it("rejects a negative or fractional quantity", async () => {
    for (const quantity of [-1, 1.5]) {
      const response = await edit({ lines: [{ id: LINE, quantity }] });

      expect(response.status).toBe(400);
    }

    expect(service.editMemberOrderItems).not.toHaveBeenCalled();
  });

  it("surfaces a line that is not open on this member as 404", async () => {
    const { NotFoundError } = await import("../src/lib/errors.js");

    service.editMemberOrderItems.mockRejectedValue(
      new NotFoundError("Order item not found")
    );

    const response = await edit({ lines: [{ id: LINE, quantity: 1 }] });

    expect(response.status).toBe(404);
  });

  it("surfaces shrinking an order below what was paid as 409", async () => {
    const { ConflictError } = await import("../src/lib/errors.js");

    service.editMemberOrderItems.mockRejectedValue(
      new ConflictError(
        "An order cannot total less than what has been paid on it"
      )
    );

    const response = await edit({ lines: [{ id: LINE, quantity: 1 }] });

    expect(response.status).toBe(409);
  });
});

describe("DELETE /orders/member/:userId", () => {
  it("voids the member's open balance and attributes the operator", async () => {
    service.voidMemberOrders.mockResolvedValue({
      member: { id: MEMBER, name: "Mirzohid", phone: null },
      orders: [],
      total: "0.00",
      paid: "0.00",
      remaining: "0.00",
    });

    const response = await request(`/orders/member/${MEMBER}`, {
      method: "DELETE",
    });

    expect(response.status).toBe(200);
    expect(service.voidMemberOrders).toHaveBeenCalledWith(GYM, MEMBER, WORKER);
  });

  it("requires a service token", async () => {
    const response = await app.request(`/orders/member/${MEMBER}`, {
      method: "DELETE",
    });

    expect(response.status).toBe(401);
    expect(service.voidMemberOrders).not.toHaveBeenCalled();
  });

  it("surfaces nothing open as 409", async () => {
    const { ConflictError } = await import("../src/lib/errors.js");

    service.voidMemberOrders.mockRejectedValue(
      new ConflictError("No open orders to delete")
    );

    const response = await request(`/orders/member/${MEMBER}`, {
      method: "DELETE",
    });

    expect(response.status).toBe(409);
  });
});
