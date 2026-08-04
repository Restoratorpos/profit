import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { updateGymSchema } from "../schemas/gym.js";
import { getGymSettings, updateGymSettings } from "../services/gym.service.js";
import type { AppEnv } from "../types/index.js";

/**
 * `requireAuth` rather than `requireCaller`: this is the settings screen, which
 * only a browser with a per-user session opens. The service door takes the
 * tenant from a client-supplied header, and "which gym am I renaming" is
 * exactly the question that must not be answerable that way.
 *
 * Reading is open to any signed-in worker — the topbar shows the gym's name on
 * every screen — while writing is the owner's and the admin's.
 */
export const gymRoutes = new Hono<AppEnv>()
  .use("*", requireAuth)
  .get("/", async (c) =>
    c.json(await getGymSettings(c.get("gymId"), c.get("user").branchId))
  )
  .patch(
    "/",
    requireRole("owner", "admin"),
    zValidator("json", updateGymSchema),
    async (c) =>
      c.json(
        await updateGymSettings(
          c.get("gymId"),
          c.get("user").branchId,
          c.req.valid("json")
        )
      )
  );
