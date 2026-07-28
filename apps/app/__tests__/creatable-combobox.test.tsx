import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  type ComboboxOption,
  CreatableCombobox,
} from "@/app/(authenticated)/products/components/creatable-combobox";

// No setup file is configured, so auto-cleanup is never registered and renders
// would otherwise accumulate across tests.
afterEach(cleanup);

// Radix's popover measures its trigger and cmdk scrolls the active row into
// view; jsdom implements neither.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    disconnect() {
      // no-op
    }
    observe() {
      // no-op
    }
    unobserve() {
      // no-op
    }
  };

  Element.prototype.scrollIntoView ??= () => {
    // no-op
  };
});

/**
 * The unit picker's real shape: the parent keeps the chosen value in state, and
 * "creating" is just accepting the typed text — nothing round-trips, so the new
 * value never appears in `options`.
 */
const FreeTextHarness = ({
  options = [],
}: {
  options?: readonly ComboboxOption[];
}) => {
  const [value, setValue] = useState<string | null>(null);

  return (
    <CreatableCombobox
      emptyLabel="None"
      onCreate={(label) => Promise.resolve({ value: label })}
      onSelect={setValue}
      options={options}
      placeholder="Unit"
      searchPlaceholder="Search or create"
      value={value}
    />
  );
};

const trigger = () => screen.getByRole("combobox");

const openList = () => {
  fireEvent.click(trigger());

  return screen.getByPlaceholderText("Search or create");
};

const clickRow = (label: string) => {
  const row = screen
    .getAllByText(label)[0]
    .closest('[data-slot="command-item"]');

  if (!row) {
    throw new Error(`No row for "${label}"`);
  }

  fireEvent.click(row);
};

describe("CreatableCombobox", () => {
  it("shows a value it just created, even though the parent's options do not contain it", async () => {
    render(<FreeTextHarness options={[{ label: "kg", value: "kg" }]} />);

    fireEvent.change(openList(), { target: { value: "dona" } });
    await screen.findAllByText("dona");
    clickRow("dona");

    expect((await screen.findByRole("combobox")).textContent).toContain("dona");
  });

  it("keeps the create row reachable when the typed text has a trailing space", () => {
    render(<FreeTextHarness />);

    fireEvent.change(openList(), { target: { value: "quti " } });

    expect(screen.getAllByText("quti").length).toBeGreaterThan(0);
  });

  it("still selects an existing option", () => {
    render(<FreeTextHarness options={[{ label: "kg", value: "kg" }]} />);

    openList();
    clickRow("kg");

    expect(trigger().textContent).toContain("kg");
  });
});
