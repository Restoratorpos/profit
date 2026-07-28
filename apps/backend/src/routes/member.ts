import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { requireService } from "../middleware/service.js";
import { setFaceSchema } from "../schemas/device.js";
import {
  createMemberSchema,
  memberQuerySchema,
  setMemberActiveSchema,
  updateMemberSchema,
} from "../schemas/member.js";
import {
  armFaceCapture,
  captureFaceAtTerminal,
  disarmFaceCapture,
  enrollFaceEverywhere,
  revokeFaceEverywhere,
  syncFaceStatus,
} from "../services/device.service.js";
import {
  createMember,
  deleteMember,
  listMembers,
  pageMembers,
  setMemberActive,
  updateMember,
} from "../services/member.service.js";
import type { AppEnv } from "../types/index.js";

export const memberRoutes = new Hono<AppEnv>()
  .use("*", requireService)
  /*
   * The whole roster, unfiltered. The pickers need it — a member search in
   * the order composer or the attendance sheet is over every member, not a
   * page of them — so it stays alongside the paged read rather than being
   * replaced by it.
   */
  .get("/", async (c) => c.json(await listMembers(c.get("gymId"))))
  // What the list screen reads: search, filters and paging, already applied.
  .get("/page", zValidator("query", memberQuerySchema), async (c) =>
    c.json(await pageMembers(c.get("gymId"), c.req.valid("query")))
  )
  .post("/", zValidator("json", createMemberSchema), async (c) => {
    const member = await createMember(
      c.get("gymId"),
      c.req.valid("json"),
      c.get("workerId")
    );

    return c.json(member, 201);
  })
  .patch("/:memberId", zValidator("json", updateMemberSchema), async (c) => {
    await updateMember(
      c.get("gymId"),
      c.req.param("memberId"),
      c.req.valid("json")
    );

    return c.body(null, 204);
  })
  /*
   * Deleting takes the face off every terminal first — see deleteMember. It is
   * refused outright for a member with money on record, so the common case is a
   * row created by mistake rather than a person with a history.
   */
  .delete("/:memberId", async (c) => {
    await deleteMember(c.get("gymId"), c.req.param("memberId"));

    return c.body(null, 204);
  })
  .patch(
    "/:memberId/status",
    zValidator("json", setMemberActiveSchema),
    async (c) => {
      await setMemberActive(
        c.get("gymId"),
        c.req.param("memberId"),
        c.req.valid("json").isActive
      );

      return c.body(null, 204);
    }
  )
  /*
   * Face enrolment lives on the member, not on a terminal, because that is how
   * the desk thinks about it: this person can get in. Which boxes hold the
   * template is the server's problem — see enrollFaceEverywhere.
   */
  .put("/:memberId/face", zValidator("json", setFaceSchema), async (c) =>
    c.json(
      await enrollFaceEverywhere(
        c.get("gymId"),
        "member",
        c.req.param("memberId"),
        c.req.valid("json").photo,
        c.get("workerId")
      )
    )
  )
  /*
   * Registers them on every terminal and reports which already hold a face.
   * Idempotent, and the refresh button on the face dialog calls exactly this —
   * "have they done it yet?" and "make sure they can" are the same question.
   */
  .post("/:memberId/face/sync", async (c) =>
    c.json(
      await syncFaceStatus(
        c.get("gymId"),
        "member",
        c.req.param("memberId"),
        c.get("workerId")
      )
    )
  )
  /*
   * Takes the photo now, with the terminal's own camera, and answers with what
   * landed. The request stays open while the device waits for the person — up to
   * about twenty seconds — because the operator is watching for the result.
   */
  .post("/:memberId/face/capture/:deviceId", async (c) =>
    c.json(
      await captureFaceAtTerminal(
        c.get("gymId"),
        "member",
        c.req.param("memberId"),
        c.req.param("deviceId"),
        c.get("workerId")
      )
    )
  )
  /*
   * Arms the terminal capture: the next face it fails to recognise becomes this
   * member's, taken from the snapshot the refusal carries. Two minutes, then it
   * lapses on its own so a forgotten dialog cannot enrol a stranger.
   */
  .post("/:memberId/face/capture", (c) => {
    armFaceCapture(c.get("gymId"), "member", c.req.param("memberId"));

    return c.body(null, 204);
  })
  .delete("/:memberId/face/capture", (c) => {
    disarmFaceCapture(c.get("gymId"));

    return c.body(null, 204);
  })
  .delete("/:memberId/face", async (c) => {
    await revokeFaceEverywhere(c.get("gymId"), c.req.param("memberId"));

    return c.body(null, 204);
  });
