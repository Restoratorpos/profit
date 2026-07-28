import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CheckInDialog } from "@/app/(authenticated)/workers/components/check-in-dialog";
import { getMessages } from "@/lib/i18n/dictionary";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: () => {
      // not under test
    },
  }),
}));

vi.mock("@/app/(authenticated)/workers/actions", () => ({
  checkInAction: vi.fn(async () => ({ ok: true })),
  checkOutAction: vi.fn(async () => ({ ok: true })),
}));

const actions = await import("@/app/(authenticated)/workers/actions");

const messages = getMessages("en");

// No setup file is configured, so auto-cleanup is never registered.
afterEach(cleanup);

const renderDialog = (mode: "in" | "out" = "in") =>
  render(
    <CheckInDialog
      locale="en"
      messages={messages}
      mode={mode}
      onOpenChange={() => {
        // not under test
      }}
      worker={{ id: "w1", name: "Dilshod" }}
    />
  );

/** The wheel's current value, read the way a screen reader would. */
const selectedIn = (wheel: HTMLElement): string => {
  const options = within(wheel).getAllByRole("option");
  const selected = options.find(
    (option) => option.getAttribute("aria-selected") === "true"
  );

  return selected?.textContent ?? "";
};

const hourWheel = () =>
  screen.getByRole("listbox", { name: messages["workers.hours"] });

const minuteWheel = () =>
  screen.getByRole("listbox", { name: messages["workers.minutes"] });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CheckInDialog time wheels", () => {
  it("offers every hour and every minute to scroll through", () => {
    renderDialog();

    expect(within(hourWheel()).getAllByRole("option")).toHaveLength(24);
    expect(within(minuteWheel()).getAllByRole("option")).toHaveLength(60);
  });

  it("selects a value when it is clicked", () => {
    renderDialog();

    fireEvent.click(within(minuteWheel()).getByRole("option", { name: "43" }));

    // The whole point of the wheel: half past is reachable without thirty
    // presses of a chevron.
    expect(selectedIn(minuteWheel())).toBe("43");
  });

  it("steps one value at a time with the arrow keys", () => {
    renderDialog();

    fireEvent.keyDown(hourWheel(), { key: "Home" });
    expect(selectedIn(hourWheel())).toBe("00");

    fireEvent.keyDown(hourWheel(), { key: "ArrowDown" });
    expect(selectedIn(hourWheel())).toBe("01");
  });

  it("wraps rather than dead-ending at the edges", () => {
    renderDialog();

    fireEvent.keyDown(hourWheel(), { key: "Home" });
    fireEvent.keyDown(hourWheel(), { key: "ArrowUp" });

    expect(selectedIn(hourWheel())).toBe("23");

    fireEvent.keyDown(minuteWheel(), { key: "End" });
    expect(selectedIn(minuteWheel())).toBe("59");

    fireEvent.keyDown(minuteWheel(), { key: "ArrowDown" });
    expect(selectedIn(minuteWheel())).toBe("00");
  });

  it("checks the worker in at the time the wheels are showing", async () => {
    renderDialog();

    fireEvent.keyDown(hourWheel(), { key: "Home" });
    fireEvent.click(within(hourWheel()).getByRole("option", { name: "07" }));
    fireEvent.click(within(minuteWheel()).getByRole("option", { name: "30" }));

    fireEvent.click(
      screen.getByRole("button", { name: messages["workers.checkIn"] })
    );

    await waitFor(() => expect(actions.checkInAction).toHaveBeenCalled());

    const [workerId, at] = vi.mocked(actions.checkInAction).mock.calls[0];
    const sent = new Date(String(at));

    expect(workerId).toBe("w1");
    // Sent as an instant, so compare in local time — that is what was picked.
    expect(sent.getHours()).toBe(7);
    expect(sent.getMinutes()).toBe(30);
  });

  it("checks out instead when opened in that mode", async () => {
    renderDialog("out");

    fireEvent.click(
      screen.getByRole("button", { name: messages["workers.checkOut"] })
    );

    await waitFor(() => expect(actions.checkOutAction).toHaveBeenCalled());
    expect(actions.checkInAction).not.toHaveBeenCalled();
  });
});
