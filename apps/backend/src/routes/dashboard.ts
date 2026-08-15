import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { requireCaller } from "../middleware/caller.js";
import { revenueQuerySchema } from "../schemas/dashboard.js";
import {
  getDashboardSnapshot,
  getRevenueReport,
} from "../services/dashboard.service.js";
import type { AppEnv } from "../types/index.js";

/**
 * Two endpoints rather than one, because the screen has two clocks.
 *
 * `/dashboard` is what is true *now* — who is in the building, what each till
 * holds, who needs chasing. `/dashboard/revenue` is what happened over a window
 * the operator chooses. Folding them together would mean re-reading the roster
 * and the shelves every time somebody switched the chart from a week to a month.
 */
export const dashboardRoutes = new Hono<AppEnv>()
  .use("*", requireCaller)
  .get("/", async (c) => c.json(await getDashboardSnapshot(c.get("gymId"))))
  .get("/revenue", zValidator("query", revenueQuerySchema), async (c) =>
    c.json(await getRevenueReport(c.get("gymId"), c.req.valid("query")))
  );
