import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { requireCaller } from "../middleware/caller.js";
import {
  createHallSchema,
  createPlanSchema,
  setPlanActiveSchema,
  updatePlanSchema,
} from "../schemas/plan.js";
import {
  createHall,
  createPlan,
  deletePlan,
  listHalls,
  listPlanMembers,
  listPlans,
  listTrainers,
  setPlanActive,
  updatePlan,
} from "../services/plan.service.js";
import type { AppEnv } from "../types/index.js";

export const planRoutes = new Hono<AppEnv>()
  .use("*", requireCaller)
  .get("/", async (c) => c.json(await listPlans(c.get("gymId"))))
  .post("/", zValidator("json", createPlanSchema), async (c) => {
    const plan = await createPlan(c.get("gymId"), c.req.valid("json"));

    return c.json(plan, 201);
  })
  .patch("/:planId", zValidator("json", updatePlanSchema), async (c) => {
    await updatePlan(
      c.get("gymId"),
      c.req.param("planId"),
      c.req.valid("json")
    );

    return c.body(null, 204);
  })
  .get("/:planId/members", async (c) =>
    c.json(await listPlanMembers(c.get("gymId"), c.req.param("planId")))
  )
  .patch(
    "/:planId/status",
    zValidator("json", setPlanActiveSchema),
    async (c) => {
      await setPlanActive(
        c.get("gymId"),
        c.req.param("planId"),
        c.req.valid("json").isActive
      );

      return c.body(null, 204);
    }
  )
  .delete("/:planId", async (c) => {
    await deletePlan(c.get("gymId"), c.req.param("planId"));

    return c.body(null, 204);
  });

export const hallRoutes = new Hono<AppEnv>()
  .use("*", requireCaller)
  .get("/", async (c) => c.json(await listHalls(c.get("gymId"))))
  .post("/", zValidator("json", createHallSchema), async (c) => {
    const hall = await createHall(c.get("gymId"), c.req.valid("json"));

    return c.json(hall, 201);
  });

export const trainerRoutes = new Hono<AppEnv>()
  .use("*", requireCaller)
  .get("/", async (c) => c.json(await listTrainers(c.get("gymId"))));
