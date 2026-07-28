import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { requireCaller } from "../middleware/caller.js";
import {
  createOrderSchema,
  editOrderItemsSchema,
  payOrdersSchema,
} from "../schemas/order.js";
import {
  createOrder,
  editMemberOrderItems,
  getMemberOrderDetail,
  listMemberOrderDebts,
  payMemberOrders,
  voidMemberOrders,
} from "../services/order.service.js";
import type { AppEnv } from "../types/index.js";

export const orderRoutes = new Hono<AppEnv>()
  .use("*", requireCaller)
  .get("/", async (c) => c.json(await listMemberOrderDebts(c.get("gymId"))))
  .post("/", zValidator("json", createOrderSchema), async (c) => {
    const order = await createOrder(
      c.get("gymId"),
      c.req.valid("json"),
      c.get("workerId")
    );

    return c.json(order, 201);
  })
  .get("/member/:userId", async (c) =>
    c.json(await getMemberOrderDetail(c.get("gymId"), c.req.param("userId")))
  )
  .post(
    "/member/:userId/pay",
    zValidator("json", payOrdersSchema),
    async (c) => {
      const detail = await payMemberOrders(
        c.get("gymId"),
        c.req.param("userId"),
        c.req.valid("json"),
        c.get("workerId")
      );

      return c.json(detail);
    }
  )
  .patch(
    "/member/:userId/items",
    zValidator("json", editOrderItemsSchema),
    async (c) => {
      const detail = await editMemberOrderItems(
        c.get("gymId"),
        c.req.param("userId"),
        c.req.valid("json"),
        c.get("workerId")
      );

      return c.json(detail);
    }
  )
  .delete("/member/:userId", async (c) =>
    c.json(
      await voidMemberOrders(
        c.get("gymId"),
        c.req.param("userId"),
        c.get("workerId")
      )
    )
  );
