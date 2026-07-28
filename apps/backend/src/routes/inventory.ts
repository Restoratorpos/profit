import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { requireCaller } from "../middleware/caller.js";
import {
  createStockActionSchema,
  createStocktakeSchema,
  createSupplierSchema,
  movementQuerySchema,
  paySupplierSchema,
  updateSupplierSchema,
} from "../schemas/inventory.js";
import {
  createStockAction,
  createStocktake,
  createSupplier,
  deleteSupplier,
  listMovements,
  listStock,
  listSuppliers,
  paySupplier,
  updateSupplier,
  voidStockAction,
} from "../services/inventory.service.js";
import type { AppEnv } from "../types/index.js";

export const inventoryRoutes = new Hono<AppEnv>()
  .use("*", requireCaller)
  .get("/", async (c) => c.json(await listStock(c.get("gymId"))))
  .get("/movements", zValidator("query", movementQuerySchema), async (c) =>
    c.json(await listMovements(c.get("gymId"), c.req.valid("query")))
  )
  .post("/actions", zValidator("json", createStockActionSchema), async (c) => {
    const action = await createStockAction(
      c.get("gymId"),
      c.req.valid("json"),
      c.get("workerId")
    );

    return c.json(action, 201);
  })
  .post("/stocktakes", zValidator("json", createStocktakeSchema), async (c) => {
    const action = await createStocktake(
      c.get("gymId"),
      c.req.valid("json"),
      c.get("workerId")
    );

    return c.json(action, 201);
  })
  .delete("/actions/:actionId", async (c) => {
    await voidStockAction(c.get("gymId"), c.req.param("actionId"));

    return c.body(null, 204);
  });

export const supplierRoutes = new Hono<AppEnv>()
  .use("*", requireCaller)
  .get("/", async (c) => c.json(await listSuppliers(c.get("gymId"))))
  .post("/", zValidator("json", createSupplierSchema), async (c) => {
    const supplier = await createSupplier(c.get("gymId"), c.req.valid("json"));

    return c.json(supplier, 201);
  })
  .patch(
    "/:supplierId",
    zValidator("json", updateSupplierSchema),
    async (c) => {
      await updateSupplier(
        c.get("gymId"),
        c.req.param("supplierId"),
        c.req.valid("json")
      );

      return c.body(null, 204);
    }
  )
  .delete("/:supplierId", async (c) => {
    await deleteSupplier(c.get("gymId"), c.req.param("supplierId"));

    return c.body(null, 204);
  })
  .post("/:supplierId/pay", zValidator("json", paySupplierSchema), async (c) =>
    c.json(
      await paySupplier(
        c.get("gymId"),
        c.req.param("supplierId"),
        c.req.valid("json"),
        c.get("workerId")
      )
    )
  );
