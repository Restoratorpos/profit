import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PendingQueue } from "@/app/(authenticated)/attendance/components/pending-queue";
import type { DoorState } from "@/lib/attendance";
import { getMessages } from "@/lib/i18n/dictionary";

const messages = getMessages("en");

/** The moment every scan in this file happened. */
const NOW = "2026-07-28T08:17:00.000Z";

const EMPTY_DOOR: DoorState = {
  duplicateScan: null,
  latestEvent: null,
  pending: [],
  unknownScan: null,
};

const noop = () => {
  // not under test
};

const renderQueue = (door: Partial<DoorState>) =>
  render(
    <PendingQueue
      decidingId={null}
      door={{ ...EMPTY_DOOR, ...door }}
      isRemovingUnknown={false}
      messages={messages}
      onDecide={noop}
      onRemoveUnknown={noop}
    />
  );

/** Let the banner's own timeout fire, the way sitting there for a while does. */
const wait = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

const waiting = () => screen.queryByText(messages["attendance.waitingScan"]);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("door banner expiry", () => {
  it("holds a repeat scan for twenty seconds, then goes back to waiting", () => {
    renderQueue({
      duplicateScan: {
        at: NOW,
        deviceName: "MAIN",
        name: "Muzaffar",
        reason: "inside",
      },
    });

    expect(screen.queryByText("Muzaffar")).not.toBeNull();
    expect(waiting()).toBeNull();

    wait(19_000);

    expect(screen.queryByText("Muzaffar")).not.toBeNull();

    wait(2000);

    expect(screen.queryByText("Muzaffar")).toBeNull();
    expect(waiting()).not.toBeNull();
  });

  it("holds an ordinary arrival for ten seconds", () => {
    renderQueue({
      latestEvent: {
        deviceName: "MAIN",
        direction: "in",
        id: 41,
        personId: "m1",
        personName: "Dilshod",
        personType: "member",
        source: "face",
        time: NOW,
      },
    });

    expect(screen.queryByText("Dilshod")).not.toBeNull();

    wait(9000);

    expect(screen.queryByText("Dilshod")).not.toBeNull();

    wait(2000);

    expect(screen.queryByText("Dilshod")).toBeNull();
    expect(waiting()).not.toBeNull();
  });

  it("shows the newer scan for its own ten seconds, not the older one's rest", () => {
    const view = renderQueue({
      latestEvent: {
        deviceName: "MAIN",
        direction: "in",
        id: 41,
        personId: "m1",
        personName: "Dilshod",
        personType: "member",
        source: "face",
        time: NOW,
      },
    });

    // Two seconds later somebody else walks in — the poll brings back theirs.
    wait(2000);

    view.rerender(
      <PendingQueue
        decidingId={null}
        door={{
          ...EMPTY_DOOR,
          latestEvent: {
            deviceName: "MAIN",
            direction: "in",
            id: 42,
            personId: "m2",
            personName: "Aziza",
            personType: "member",
            source: "face",
            time: new Date(Date.now()).toISOString(),
          },
        }}
        isRemovingUnknown={false}
        messages={messages}
        onDecide={noop}
        onRemoveUnknown={noop}
      />
    );

    expect(screen.queryByText("Dilshod")).toBeNull();
    expect(screen.queryByText("Aziza")).not.toBeNull();

    // The first one's ten seconds are up; the second one's are not.
    wait(9000);

    expect(screen.queryByText("Aziza")).not.toBeNull();

    wait(2000);

    expect(screen.queryByText("Aziza")).toBeNull();
  });
});

describe("refusal banner expiry", () => {
  const pending = [
    {
      accessFrom: null,
      accessTo: null,
      at: NOW,
      memberId: "m9",
      name: "Sardor",
      phone: null,
      planName: null,
      reason: "wrong_weekday" as const,
      sessionId: 7,
    },
  ];

  it("drops the banner after twenty seconds and keeps the queue row", () => {
    renderQueue({ pending });

    // Once on the banner, once in the queue underneath.
    expect(screen.getAllByText("Sardor")).toHaveLength(2);

    wait(21_000);

    expect(screen.getAllByText("Sardor")).toHaveLength(1);
    expect(
      screen.queryByRole("button", {
        name: messages["attendance.acceptAnyway"],
      })
    ).not.toBeNull();
  });
});
