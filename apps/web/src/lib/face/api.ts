import { apiFetch } from "@/lib/api/client";
import { queryClient } from "@/lib/query-client";

/**
 * Face enrolment, for whoever is standing at the terminal.
 *
 * Members and staff enrol identically — the same six calls, the same dialog, the
 * same terminals — so the person type is an argument rather than a second copy of
 * this file. The backend agrees: every function in `device.service` already takes
 * a `personType`, and `ingestTerminalEvent` resolves a scan to either without
 * caring which it turns out to be.
 *
 * What differs afterwards is only what the scan *means*: a member arriving has to
 * be entitled to, and a worker's scan opens or closes a shift. That decision is
 * the backend's, not this module's.
 */
export type FacePersonType = "member" | "worker";

/**
 * These return `{ ok, error }` rather than throwing, unlike every other call in
 * the app.
 *
 * That is deliberate and worth keeping: these talk to hardware over the LAN, and
 * "that terminal did not answer" is an ordinary per-device outcome the dialog
 * lists next to the device, not an exception that should blow up a render.
 */
export interface FaceResult {
  error?: string;
  ok: boolean;
}

/**
 * The collection root, which is both the API prefix and the query to invalidate —
 * they happen to coincide, and a second map would only be a chance to disagree.
 */
const ROOT: Record<FacePersonType, string> = {
  member: "/members",
  worker: "/workers",
};

/**
 * Invalidated through the module-level client rather than a hook, because these
 * are called imperatively from a dialog rather than during render. Replaces the
 * `revalidatePath(ROOT[personType])` the server action did.
 */
const settle = (personType: FacePersonType): void => {
  queryClient.invalidateQueries({
    queryKey: [personType === "member" ? "members" : "workers"],
  });
};

const run = async (
  personType: FacePersonType,
  work: () => Promise<unknown>
): Promise<FaceResult> => {
  try {
    await work();
    settle(personType);

    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
};

export interface TerminalFaceStatus {
  /** What went wrong reaching this one, if anything. */
  error: string | null;
  /** True once the device holds a face for them. */
  hasFace: boolean;
  id: string;
  name: string;
}

/**
 * Registers the person on every terminal and reports which already hold a face.
 * The dialog calls this on open and on every refresh — it is idempotent, so
 * "make sure they can be captured" and "have they been yet?" are one call.
 */
export const syncFace = async (
  personType: FacePersonType,
  personId: string
): Promise<{ error?: string; terminals: TerminalFaceStatus[] }> => {
  try {
    const terminals = await apiFetch<TerminalFaceStatus[]>(
      `${ROOT[personType]}/${personId}/face/sync`,
      { method: "POST" }
    );

    settle(personType);

    return { terminals };
  } catch (error) {
    return { error: (error as Error).message, terminals: [] };
  }
};

/**
 * Has the terminal take the photo now and enrols it everywhere.
 *
 * Slow on purpose: the device holds the request open while it waits for somebody
 * to look at it, so this resolves when the capture has actually happened — which
 * is what lets the dialog show a result instead of a hope.
 */
export const captureFace = (
  personType: FacePersonType,
  personId: string,
  deviceId: string
): Promise<FaceResult> =>
  run(personType, () =>
    apiFetch(`${ROOT[personType]}/${personId}/face/capture/${deviceId}`, {
      method: "POST",
    })
  );

/**
 * Arms the terminal capture: the next face it refuses becomes this person's,
 * taken from the snapshot the refusal carries. Lapses on its own after two
 * minutes.
 */
export const armFaceCapture = (
  personType: FacePersonType,
  personId: string
): Promise<FaceResult> =>
  run(personType, () =>
    apiFetch(`${ROOT[personType]}/${personId}/face/capture`, { method: "POST" })
  );

export const disarmFaceCapture = (
  personType: FacePersonType,
  personId: string
): Promise<FaceResult> =>
  run(personType, () =>
    apiFetch(`${ROOT[personType]}/${personId}/face/capture`, {
      method: "DELETE",
    })
  );

/**
 * Sets or replaces a face on every active terminal. Separate from the person
 * write because it talks to hardware over the LAN: a terminal that is unplugged
 * must not stop somebody being registered.
 */
export const setFace = (
  personType: FacePersonType,
  personId: string,
  /**
   * Omitted registers them on every terminal without a face, so it can be
   * captured at the device — the better photo, and the only route when nobody
   * has a picture of them.
   */
  photo?: string
): Promise<FaceResult> =>
  run(personType, () =>
    apiFetch(`${ROOT[personType]}/${personId}/face`, {
      body: JSON.stringify(photo ? { photo } : {}),
      method: "PUT",
    })
  );

export const removeFace = (
  personType: FacePersonType,
  personId: string
): Promise<FaceResult> =>
  run(personType, () =>
    apiFetch(`${ROOT[personType]}/${personId}/face`, { method: "DELETE" })
  );
