import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { requireCaller } from "../middleware/caller.js";
import {
  createCategorySchema,
  createProductSchema,
  updateCategorySchema,
  updateProductSchema,
} from "../schemas/catalog.js";
import {
  createCategory,
  createProduct,
  deleteCategory,
  deleteProduct,
  listCategories,
  listProducts,
  updateCategory,
  updateProduct,
} from "../services/catalog.service.js";
import type { AppEnv } from "../types/index.js";

/**
 * Reachable both ways during the migration — apps/app server-side with the
 * shared token, apps/web from the browser with a bearer token. `requireCaller`
 * normalises the two, putting the caller's tenant on the context; every handler
 * passes it straight into the service, which is where the scoping actually
 * happens.
 */
export const categoryRoutes = new Hono<AppEnv>()
  .use("*", requireCaller)
  .get("/", async (c) => c.json(await listCategories(c.get("gymId"))))
  .post("/", zValidator("json", createCategorySchema), async (c) => {
    const category = await createCategory(c.get("gymId"), c.req.valid("json"));

    return c.json(category, 201);
  })
  .patch(
    "/:categoryId",
    zValidator("json", updateCategorySchema),
    async (c) => {
      const category = await updateCategory(
        c.get("gymId"),
        c.req.param("categoryId"),
        c.req.valid("json")
      );

      return c.json(category);
    }
  )
  .delete("/:categoryId", async (c) => {
    await deleteCategory(c.get("gymId"), c.req.param("categoryId"));

    return c.body(null, 204);
  });

export const productRoutes = new Hono<AppEnv>()
  .use("*", requireCaller)
  .get("/", async (c) => c.json(await listProducts(c.get("gymId"))))
  .post("/", zValidator("json", createProductSchema), async (c) => {
    const product = await createProduct(c.get("gymId"), c.req.valid("json"));

    return c.json(product, 201);
  })
  .patch("/:productId", zValidator("json", updateProductSchema), async (c) => {
    await updateProduct(
      c.get("gymId"),
      c.req.param("productId"),
      c.req.valid("json")
    );

    return c.body(null, 204);
  })
  .delete("/:productId", async (c) => {
    await deleteProduct(c.get("gymId"), c.req.param("productId"));

    return c.body(null, 204);
  });
