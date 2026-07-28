import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { requireCaller } from "../middleware/caller.js";
import { createComboSchema, updateComboSchema } from "../schemas/combo.js";
import {
  createCombo,
  deleteCombo,
  listCombos,
  updateCombo,
} from "../services/combo.service.js";
import type { AppEnv } from "../types/index.js";

/**
 * Reachable both ways during the migration — apps/app server-side with the
 * shared token, apps/web from the browser with a bearer token. `requireCaller`
 * normalises the two, putting the caller's tenant on the context; every handler
 * passes it into the service, which is where the gym scoping actually happens.
 */
export const comboRoutes = new Hono<AppEnv>()
  .use("*", requireCaller)
  .get("/", async (c) => c.json(await listCombos(c.get("gymId"))))
  .post("/", zValidator("json", createComboSchema), async (c) => {
    const combo = await createCombo(c.get("gymId"), c.req.valid("json"));

    return c.json(combo, 201);
  })
  .put("/:comboId", zValidator("json", updateComboSchema), async (c) => {
    const combo = await updateCombo(
      c.get("gymId"),
      c.req.param("comboId"),
      c.req.valid("json")
    );

    return c.json(combo);
  })
  .delete("/:comboId", async (c) => {
    await deleteCombo(c.get("gymId"), c.req.param("comboId"));

    return c.body(null, 204);
  });
