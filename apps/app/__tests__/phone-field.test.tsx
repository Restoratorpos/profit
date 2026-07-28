import { PhoneField } from "@repo/auth/components/phone-field";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

// This project configures no setup file, so testing-library's auto-cleanup is
// never registered and renders would otherwise accumulate across tests.
afterEach(cleanup);

const setup = (props: { disabled?: boolean } = {}) => {
  const { container } = render(<PhoneField {...props} />);

  const query = <T extends Element>(selector: string): T => {
    const element = container.querySelector<T>(selector);

    if (!element) {
      throw new Error(`Expected to find ${selector}`);
    }

    return element;
  };

  return {
    /** What the surrounding form actually submits. */
    hidden: query<HTMLInputElement>('input[type="hidden"][name="phone"]'),
    visible: query<HTMLInputElement>("input#phone"),
    country: query<HTMLButtonElement>('[data-slot="select-trigger"]'),
  };
};

describe("PhoneField", () => {
  it("defaults to Uzbekistan", () => {
    expect(setup().country.textContent).toContain("+998");
  });

  it("submits the dial code joined to the typed national number", () => {
    const { hidden, visible } = setup();

    fireEvent.change(visible, { target: { value: "90 766 17 70" } });

    expect(hidden.value).toBe("998907661770");
  });

  it("keeps the country code out of the visible input when a full number is pasted", () => {
    const { hidden, visible } = setup();

    fireEvent.change(visible, { target: { value: "+998 88 216 75 55" } });

    expect(visible.value).toBe("88 216 75 55");
    expect(hidden.value).toBe("998882167555");
  });

  it("groups the digits as they are typed", () => {
    const { visible } = setup();

    fireEvent.change(visible, { target: { value: "9076" } });

    expect(visible.value).toBe("90 76");
  });

  it("submits digits only, never the display spacing", () => {
    const { hidden, visible } = setup();

    fireEvent.change(visible, { target: { value: "90 766 17 70" } });

    expect(hidden.value).toBe("998907661770");
  });

  it("refuses to exceed the country's national length", () => {
    const { visible } = setup();

    fireEvent.change(visible, { target: { value: "1234567890000" } });

    expect(visible.value).toBe("12 345 67 89");
  });

  it("submits only the dial code before anything is typed", () => {
    expect(setup().hidden.value).toBe("998");
  });

  it("disables both controls while the form is submitting", () => {
    const { visible, country } = setup({ disabled: true });

    expect(visible.disabled).toBe(true);
    expect(country.disabled).toBe(true);
  });
});
