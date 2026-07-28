import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { toTerminalEvent } from "../lib/hikvision.js";
import { requireCaller } from "../middleware/caller.js";
import {
  attendanceQuerySchema,
  decidePendingSchema,
  manualVisitSchema,
  recentEventsQuerySchema,
} from "../schemas/attendance.js";
import {
  createDeviceSchema,
  enrollSchema,
  syncEventsSchema,
  updateDeviceSchema,
} from "../schemas/device.js";
import {
  countOpenSessions,
  decidePending,
  ingestTerminalEvent,
  listAttendance,
  listRecentEvents,
  readDoorState,
  recordManualVisit,
} from "../services/attendance.service.js";
import {
  captureFaceFromEvent,
  createDevice,
  deleteDevice,
  enablePush,
  enrollPerson,
  findDeviceByWebhookKey,
  listDevices,
  listEnrolled,
  openDeviceDoor,
  removeUnknownFromTerminal,
  revokePerson,
  syncEvents,
  testDevice,
  updateDevice,
} from "../services/device.service.js";
import type { AppEnv } from "../types/index.js";

export const deviceRoutes = new Hono<AppEnv>()
  .use("*", requireCaller)
  .get("/", async (c) => c.json(await listDevices(c.get("gymId"))))
  .post("/", zValidator("json", createDeviceSchema), async (c) => {
    const device = await createDevice(
      c.get("gymId"),
      c.req.valid("json"),
      c.get("workerId")
    );

    return c.json(device, 201);
  })
  .patch("/:deviceId", zValidator("json", updateDeviceSchema), async (c) => {
    await updateDevice(
      c.get("gymId"),
      c.req.param("deviceId"),
      c.req.valid("json")
    );

    return c.body(null, 204);
  })
  .delete("/:deviceId", async (c) => {
    await deleteDevice(c.get("gymId"), c.req.param("deviceId"));

    return c.body(null, 204);
  })
  .post("/:deviceId/test", async (c) =>
    c.json(await testDevice(c.get("gymId"), c.req.param("deviceId")))
  )
  .post("/:deviceId/push", async (c) =>
    c.json(await enablePush(c.get("gymId"), c.req.param("deviceId")))
  )
  .post("/:deviceId/door", async (c) => {
    await openDeviceDoor(c.get("gymId"), c.req.param("deviceId"));

    return c.body(null, 204);
  })
  .post("/:deviceId/sync", zValidator("json", syncEventsSchema), async (c) =>
    c.json(
      await syncEvents(
        c.get("gymId"),
        c.req.param("deviceId"),
        c.req.valid("json")
      )
    )
  )
  .get("/:deviceId/people", async (c) =>
    c.json(await listEnrolled(c.get("gymId"), c.req.param("deviceId")))
  )
  .post("/:deviceId/people", zValidator("json", enrollSchema), async (c) => {
    const result = await enrollPerson(
      c.get("gymId"),
      c.req.param("deviceId"),
      c.req.valid("json"),
      c.get("workerId")
    );

    return c.json(result, 201);
  })
  .delete("/:deviceId/people/:credentialId", async (c) => {
    await revokePerson(
      c.get("gymId"),
      c.req.param("deviceId"),
      c.req.param("credentialId")
    );

    return c.body(null, 204);
  });

/**
 * Attendance reads, plus the one endpoint in this server that is **not** behind
 * the service token: the terminal's push URL.
 *
 * A DS-K1T342MX cannot be told to send a custom header, so it authenticates with
 * the 128-bit key in its own URL and nothing else. That key is minted per device
 * and yields the gym, so a request either resolves to exactly one terminal or is
 * refused — there is no tenant to spoof.
 */
export const attendanceRoutes = new Hono<AppEnv>()
  .post("/hik/:key", async (c) => {
    const device = await findDeviceByWebhookKey(c.req.param("key"));
    const logger = c.get("logger");

    if (!(device?.gymId && device.isActive)) {
      // Deliberately 200: an unknown or disabled key must not tell a prober that
      // it guessed wrong, and a terminal that retries forever is worse than one
      // that thinks it delivered.
      logger?.warn({ path: c.req.path }, "push from an unknown terminal key");

      return c.json({ status: "ignored" });
    }

    const push = await readEventPayload(c.req.raw);

    if (!push.payload) {
      return c.json({ status: "ignored" });
    }

    const event = toTerminalEvent(push.payload, new Date());

    if (!event) {
      return c.json({ status: "ignored" });
    }

    /*
     * A face the terminal did not recognise, while the desk is waiting to enrol
     * somebody: this refusal carries the snapshot that was taken, so it becomes
     * the enrolment. The operator sees "authentication failed" on the device and
     * a tick in the app, which is the right way round — the door genuinely did
     * refuse them, and now it will not next time.
     */
    if (!event.employeeNo && push.picture) {
      const captured = await captureFaceFromEvent(
        device.gymId,
        push.picture,
        null
      );

      if (captured) {
        logger?.info(
          { deviceId: device.deviceId, personId: captured.personId },
          "face captured from a refused scan"
        );

        return c.json({ status: "captured" });
      }
    }

    const outcome = await ingestTerminalEvent(
      device.gymId,
      {
        branchId: device.branchId,
        deviceId: device.deviceId,
        deviceName: device.deviceName,
        direction: device.direction,
      },
      event
    );

    logger?.info(
      { deviceId: device.deviceId, employeeNo: event.employeeNo, outcome },
      "terminal event"
    );

    return c.json(outcome);
  })
  /*
   * `requireCaller` is attached per route rather than as a `use("*")` on this
   * router. A wildcard would also match the push URL above, and whether it ran
   * would depend on registration order — too subtle a thing to have standing
   * between a terminal and a 401 it can never satisfy.
   */
  .get(
    "/events",
    requireCaller,
    zValidator("query", recentEventsQuerySchema),
    async (c) =>
      c.json(await listRecentEvents(c.get("gymId"), c.req.valid("query").limit))
  )
  .get("/inside", requireCaller, async (c) =>
    c.json({ count: await countOpenSessions(c.get("gymId")) })
  )
  .get("/door", requireCaller, async (c) =>
    c.json(await readDoorState(c.get("gymId")))
  )
  .post("/unknown/remove", requireCaller, async (c) => {
    await removeUnknownFromTerminal(c.get("gymId"));

    return c.body(null, 204);
  })
  .post(
    "/pending/:sessionId",
    requireCaller,
    zValidator("json", decidePendingSchema),
    async (c) => {
      await decidePending(
        c.get("gymId"),
        Number(c.req.param("sessionId")),
        c.req.valid("json").isAccepted,
        c.get("workerId")
      );

      return c.body(null, 204);
    }
  )
  .get(
    "/sessions",
    requireCaller,
    zValidator("query", attendanceQuerySchema),
    async (c) => {
      const query = c.req.valid("query");

      return c.json(
        await listAttendance(c.get("gymId"), {
          from: new Date(query.from),
          page: query.page,
          pageSize: query.pageSize,
          query: query.query ?? null,
          to: new Date(query.to),
        })
      );
    }
  )
  .post(
    "/manual",
    requireCaller,
    zValidator("json", manualVisitSchema),
    async (c) => {
      await recordManualVisit(
        c.get("gymId"),
        c.req.valid("json").memberId,
        c.get("workerId")
      );

      return c.body(null, 204);
    }
  );

/**
 * The device posts either `multipart/form-data` — a JSON part plus the snapshot
 * it took — or, on some firmware and for heartbeats, plain JSON. Both shapes
 * arrive on the same URL, so both are read here rather than assuming one.
 */
interface EventPush {
  payload: unknown;
  /** The snapshot the terminal took, when it sent one. */
  picture: Uint8Array | null;
}

const readEventPayload = async (request: Request): Promise<EventPush> => {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.includes("multipart/form-data")) {
    return {
      payload: await request.json().catch(() => null),
      picture: null,
    };
  }

  const form = await request.formData().catch(() => null);

  if (!form) {
    return { payload: null, picture: null };
  }

  let payload: unknown = null;
  let picture: Uint8Array | null = null;

  for (const [, value] of form.entries()) {
    // Parts are not consistently named across firmware versions (`event_log`,
    // `AccessControllerEvent`, `Picture`, sometimes unnamed), so each is taken
    // by shape: the one that parses as JSON is the event, a file is the photo.
    if (typeof value === "string") {
      if (payload === null) {
        try {
          payload = JSON.parse(value);
        } catch {
          // Not the event part — keep looking.
        }
      }

      continue;
    }

    if (!picture && value.size > 0) {
      picture = new Uint8Array(await value.arrayBuffer());
    }
  }

  return { payload, picture };
};
