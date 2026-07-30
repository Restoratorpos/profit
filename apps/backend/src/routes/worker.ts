import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { requireCaller } from "../middleware/caller.js";
import { setFaceSchema } from "../schemas/device.js";
import {
  attendanceMarkSchema,
  createWorkerSchema,
  paydaySchema,
  payrollQuerySchema,
  payWorkerSchema,
  salaryHistoryQuerySchema,
  setWorkerActiveSchema,
  updateWorkerSchema,
  workerQuerySchema,
} from "../schemas/worker.js";
import {
  armFaceCapture,
  captureFaceAtTerminal,
  disarmFaceCapture,
  enrollFaceEverywhere,
  revokeFaceEverywhere,
  syncFaceStatus,
} from "../services/device.service.js";
import {
  checkIn,
  checkOut,
  createWorker,
  getPayday,
  getWorkerDetail,
  getWorkerPayroll,
  listSalaryPayments,
  listWorkers,
  pageWorkers,
  payWorker,
  rangeFromQuery,
  setPayday,
  setWorkerActive,
  updateWorker,
} from "../services/worker.service.js";
import type { AppEnv } from "../types/index.js";

/**
 * Reachable both ways during the migration — apps/app server-side with the
 * shared token, apps/web from the browser with a bearer token. `requireCaller`
 * normalises the two, putting the caller's tenant and operator on the context;
 * every handler passes them into the service, which is where the gym scoping
 * happens.
 */
export const workerRoutes = new Hono<AppEnv>()
  .use("*", requireCaller)
  .get("/", async (c) =>
    c.json(
      await listWorkers(
        c.get("gymId"),
        rangeFromQuery(c.req.query("from"), c.req.query("to"))
      )
    )
  )
  // What the list screen reads: search, filter and paging, already applied.
  .get("/page", zValidator("query", workerQuerySchema), async (c) => {
    const query = c.req.valid("query");

    return c.json(
      await pageWorkers(
        c.get("gymId"),
        rangeFromQuery(query.from, query.to),
        query
      )
    );
  })
  /*
   * Every wage the gym has handed over, across all staff.
   *
   * Registered above `/:workerId` because it would otherwise be read as a
   * worker whose id is "payments" — Hono matches in registration order, which
   * is the same reason `/page` sits where it does.
   */
  .get(
    "/payments",
    zValidator("query", salaryHistoryQuerySchema),
    async (c) => {
      const query = c.req.valid("query");

      return c.json(
        await listSalaryPayments(
          c.get("gymId"),
          rangeFromQuery(query.from, query.to),
          query
        )
      );
    }
  )
  /*
   * The day of the month monthly salaries are settled on. A gym-wide policy, so
   * it reads and writes one field on `gyms` — and, like `/payments`, it has to
   * be registered above `/:workerId` to not be read as a worker id.
   */
  .get("/payday", async (c) =>
    c.json({ payday: await getPayday(c.get("gymId")) })
  )
  .put("/payday", zValidator("json", paydaySchema), async (c) => {
    await setPayday(c.get("gymId"), c.req.valid("json").payday);

    return c.body(null, 204);
  })
  .post("/", zValidator("json", createWorkerSchema), async (c) => {
    const worker = await createWorker(c.get("gymId"), c.req.valid("json"));

    return c.json(worker, 201);
  })
  .get("/:workerId", async (c) =>
    c.json(
      await getWorkerDetail(
        c.get("gymId"),
        c.req.param("workerId"),
        rangeFromQuery(c.req.query("from"), c.req.query("to"))
      )
    )
  )
  .patch("/:workerId", zValidator("json", updateWorkerSchema), async (c) => {
    await updateWorker(
      c.get("gymId"),
      c.req.param("workerId"),
      c.req.valid("json")
    );

    return c.body(null, 204);
  })
  .post(
    "/:workerId/active",
    zValidator("json", setWorkerActiveSchema),
    async (c) => {
      await setWorkerActive(
        c.get("gymId"),
        c.req.param("workerId"),
        c.req.valid("json").isActive
      );

      return c.body(null, 204);
    }
  )
  /*
   * Payroll for one month, which is what the pay window opens on. Keyed by a
   * `YYYY-MM` period rather than the from/to the list screen uses: a wage is
   * paid against a month, and letting this take an arbitrary range would invite
   * paying against half of one.
   */
  .get(
    "/:workerId/payroll",
    zValidator("query", payrollQuerySchema),
    async (c) =>
      c.json(
        await getWorkerPayroll(
          c.get("gymId"),
          c.req.param("workerId"),
          c.req.valid("query").period
        )
      )
  )
  .post("/:workerId/pay", zValidator("json", payWorkerSchema), async (c) => {
    await payWorker(
      c.get("gymId"),
      c.req.param("workerId"),
      c.req.valid("json"),
      c.get("workerId")
    );

    return c.body(null, 204);
  })
  .post(
    "/:workerId/check-in",
    zValidator("json", attendanceMarkSchema),
    async (c) => {
      await checkIn(
        c.get("gymId"),
        c.req.param("workerId"),
        c.req.valid("json")
      );

      return c.body(null, 204);
    }
  )
  .post(
    "/:workerId/check-out",
    zValidator("json", attendanceMarkSchema),
    async (c) => {
      await checkOut(
        c.get("gymId"),
        c.req.param("workerId"),
        c.req.valid("json")
      );

      return c.body(null, 204);
    }
  )
  /*
   * Face enrolment for staff, the same six calls the members router exposes and
   * deliberately the same shapes — the desk uses one dialog for both.
   *
   * A worker's face is what clocks them on: `ingestTerminalEvent` resolves the
   * credential to a worker and toggles their shift open, then closed on the next
   * scan. Nothing here is worker-specific beyond the person type, because none of
   * it should be.
   */
  .put("/:workerId/face", zValidator("json", setFaceSchema), async (c) =>
    c.json(
      await enrollFaceEverywhere(
        c.get("gymId"),
        "worker",
        c.req.param("workerId"),
        c.req.valid("json").photo,
        c.get("workerId")
      )
    )
  )
  .post("/:workerId/face/sync", async (c) =>
    c.json(
      await syncFaceStatus(
        c.get("gymId"),
        "worker",
        c.req.param("workerId"),
        c.get("workerId")
      )
    )
  )
  .post("/:workerId/face/capture/:deviceId", async (c) =>
    c.json(
      await captureFaceAtTerminal(
        c.get("gymId"),
        "worker",
        c.req.param("workerId"),
        c.req.param("deviceId"),
        c.get("workerId")
      )
    )
  )
  .post("/:workerId/face/capture", (c) => {
    armFaceCapture(c.get("gymId"), "worker", c.req.param("workerId"));

    return c.body(null, 204);
  })
  .delete("/:workerId/face/capture", (c) => {
    disarmFaceCapture(c.get("gymId"));

    return c.body(null, 204);
  })
  .delete("/:workerId/face", async (c) => {
    await revokeFaceEverywhere(c.get("gymId"), c.req.param("workerId"));

    return c.body(null, 204);
  });
