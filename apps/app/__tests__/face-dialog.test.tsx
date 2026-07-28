import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FaceDialog } from "@/app/(authenticated)/components/face-dialog";
import type { TerminalFaceStatus } from "@/lib/face-actions";
import { getMessages } from "@/lib/i18n/dictionary";

// The dialog talks to the terminal through server actions; none of them can run
// in jsdom, and the point of these tests is *which* ones it calls unprompted.
vi.mock("@/lib/face-actions", () => ({
  armFaceCaptureAction: vi.fn(async () => ({ ok: true })),
  captureFaceAction: vi.fn(async () => ({ ok: true })),
  disarmFaceCaptureAction: vi.fn(async () => ({ ok: true })),
  removeFaceAction: vi.fn(async () => ({ ok: true })),
  setFaceAction: vi.fn(async () => ({ ok: true })),
  syncFaceAction: vi.fn(async () => ({ terminals: [] })),
}));

const actions = await import("@/lib/face-actions");

const messages = getMessages("en");

// No setup file is configured, so auto-cleanup is never registered.
afterEach(cleanup);

const MAIN: TerminalFaceStatus = {
  error: null,
  hasFace: false,
  id: "d1",
  name: "MAIN",
};

const terminalsAre = (...terminals: TerminalFaceStatus[]) => {
  vi.mocked(actions.syncFaceAction).mockResolvedValue({ terminals });
};

const renderDialog = (
  properties: Partial<Parameters<typeof FaceDialog>[0]> = {}
) =>
  render(
    <FaceDialog
      messages={messages}
      onDone={() => {
        // not under test
      }}
      onOpenChange={() => {
        // not under test
      }}
      onPhotoPicked={() => {
        // not under test
      }}
      open={true}
      personId="m1"
      personType="member"
      {...properties}
    />
  );

beforeEach(() => {
  vi.clearAllMocks();
  terminalsAre(MAIN);
  vi.mocked(actions.captureFaceAction).mockResolvedValue({ ok: true });
});

describe("FaceDialog", () => {
  it("opens the terminal's camera without anybody pressing a button", async () => {
    renderDialog();

    await waitFor(() =>
      expect(actions.captureFaceAction).toHaveBeenCalledWith(
        "member",
        "m1",
        "d1"
      )
    );
  });

  it("registers the person before asking for the photo", async () => {
    renderDialog();

    await waitFor(() =>
      expect(actions.syncFaceAction).toHaveBeenCalledWith("member", "m1")
    );

    // The device needs the employeeNo before its camera will capture for them.
    const syncedAt = vi.mocked(actions.syncFaceAction).mock
      .invocationCallOrder[0];
    const capturedAt = vi.mocked(actions.captureFaceAction).mock
      .invocationCallOrder[0];

    expect(syncedAt).toBeLessThan(capturedAt);
  });

  it("enrols staff through the worker endpoints, not the member ones", async () => {
    renderDialog({ personId: "w1", personType: "worker" });

    await waitFor(() =>
      expect(actions.captureFaceAction).toHaveBeenCalledWith(
        "worker",
        "w1",
        "d1"
      )
    );

    expect(actions.syncFaceAction).toHaveBeenCalledWith("worker", "w1");
    expect(actions.armFaceCaptureAction).toHaveBeenCalledWith("worker", "w1");
  });

  it("scans once, not once per render", async () => {
    const { rerender } = renderDialog();

    await waitFor(() =>
      expect(actions.captureFaceAction).toHaveBeenCalledTimes(1)
    );

    rerender(
      <FaceDialog
        messages={messages}
        onDone={() => {
          // a fresh identity every render, which must not re-trigger the scan
        }}
        onOpenChange={() => {
          // as above
        }}
        onPhotoPicked={() => {
          // as above
        }}
        open={true}
        personId="m1"
        personType="member"
      />
    );

    await waitFor(() =>
      expect(actions.captureFaceAction).toHaveBeenCalledTimes(1)
    );
  });

  it("stays quiet while it is closed", async () => {
    renderDialog({ open: false });

    await waitFor(() => expect(actions.syncFaceAction).not.toHaveBeenCalled());
    expect(actions.captureFaceAction).not.toHaveBeenCalled();
  });

  it("does nothing until the person has been saved", async () => {
    renderDialog({ personId: null });

    await waitFor(() =>
      expect(actions.captureFaceAction).not.toHaveBeenCalled()
    );
  });

  it("arms the fallback so a refused scan still lands on this person", async () => {
    renderDialog();

    await waitFor(() =>
      expect(actions.armFaceCaptureAction).toHaveBeenCalledWith("member", "m1")
    );
  });

  it("re-takes the photo when they already have a face", async () => {
    terminalsAre({ ...MAIN, hasFace: true });

    renderDialog();

    // "Change the face" is a request to replace one, so an existing face is not
    // a reason to skip the scan.
    await waitFor(() =>
      expect(actions.captureFaceAction).toHaveBeenCalledWith(
        "member",
        "m1",
        "d1"
      )
    );
  });

  it("does not hold a camera open on a terminal it could not reach", async () => {
    terminalsAre({ ...MAIN, error: "connect ETIMEDOUT" });

    renderDialog();

    await waitFor(() =>
      expect(actions.syncFaceAction).toHaveBeenCalledWith("member", "m1")
    );
    expect(actions.captureFaceAction).not.toHaveBeenCalled();
  });

  it("offers a retry, not a first capture, once the scan has failed", async () => {
    vi.mocked(actions.captureFaceAction).mockResolvedValue({
      error: "captureTimeout",
      ok: false,
    });

    renderDialog();

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: messages["members.faceRetry"] })
      ).toBeDefined()
    );

    expect(
      screen.queryByRole("button", { name: messages["members.faceCapture"] })
    ).toBeNull();
  });

  it("reports the reason a scan failed", async () => {
    vi.mocked(actions.captureFaceAction).mockResolvedValue({
      error: "The terminal timed out waiting for a face.",
      ok: false,
    });

    renderDialog();

    await waitFor(() =>
      expect(
        screen.getByText("The terminal timed out waiting for a face.")
      ).toBeDefined()
    );
  });
});
