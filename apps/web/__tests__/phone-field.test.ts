import {
  COUNTRIES,
  CUSTOM_COUNTRY,
  CUSTOM_COUNTRY_CODE,
  findCountry,
  formatNational,
  formatPhone,
  isSupportedPhone,
  SELECTABLE_COUNTRIES,
  splitPhone,
  toFullPhone,
  toNationalDigits,
} from "@repo/auth/lib/countries";
import { describe, expect, it } from "vitest";

/**
 * The phone picker behind the worker and member forms.
 *
 * Two things here are worth a test rather than an eye. Editing an existing
 * person only works if a stored number splits back into the country that owns
 * it and the digits that go in the box — get that wrong and every edit silently
 * rewrites the number it opened with. And "Other country" has to be an escape
 * hatch the *picker* offers without becoming a country the rest of the system
 * believes in: it matches everything by construction, so if it leaked into
 * `COUNTRIES` it would swallow `formatPhone`'s guess and make
 * `isSupportedPhone` admit anything.
 */

describe("splitting a stored number back into the picker", () => {
  it("gives an Uzbek number to Uzbekistan, without its dial code", () => {
    expect(splitPhone("998907661770")).toEqual({
      countryCode: "UZ",
      national: "907661770",
    });
  });

  it("tells Kazakhstan from Russia by length, not by the 7 they share", () => {
    // Both dial +7 with ten national digits, so the first match wins — what
    // matters is that neither is mistaken for a country of another length.
    expect(splitPhone("77012345678").national).toBe("7012345678");
    expect(splitPhone("79123456789").national).toBe("9123456789");
  });

  it("opens an empty field on the default country rather than on nothing", () => {
    expect(splitPhone("")).toEqual({ countryCode: "UZ", national: "" });
    expect(splitPhone(null)).toEqual({ countryCode: "UZ", national: "" });
  });

  it("keeps a foreign number whole under 'other country'", () => {
    // A US number matches no country here. Trimming it to fit Uzbekistan is
    // what the old plain input did to it.
    expect(splitPhone("12025550134")).toEqual({
      countryCode: CUSTOM_COUNTRY_CODE,
      national: "12025550134",
    });
  });

  it("round-trips: what the field submits is what it reopens on", () => {
    for (const stored of ["998907661770", "996700123456", "12025550134"]) {
      const { countryCode, national } = splitPhone(stored);

      expect(toFullPhone(national, findCountry(countryCode))).toBe(stored);
    }
  });
});

describe("'other country' is offered but never believed", () => {
  it("is in the picker's list and not in the served countries", () => {
    expect(SELECTABLE_COUNTRIES).toContain(CUSTOM_COUNTRY);
    expect(COUNTRIES).not.toContain(CUSTOM_COUNTRY);
  });

  it("does not make an unsupported number pass sign-in's check", () => {
    // `isSupportedPhone` reads COUNTRIES. A custom entry that matched anything
    // would let any string of digits sign up.
    expect(isSupportedPhone("12025550134")).toBe(false);
    expect(isSupportedPhone("998907661770")).toBe(true);
  });

  it("leaves a number it cannot place as bare digits, not a guess", () => {
    expect(formatPhone("12025550134")).toBe("12025550134");
    expect(formatPhone("998907661770")).toBe("+998 90 766 17 70");
  });

  it("carries the whole number, dial code and all", () => {
    // Nothing is stripped: under this option the operator types the country
    // code themselves, so it is part of the number rather than the picker's.
    expect(toNationalDigits("12025550134", CUSTOM_COUNTRY)).toBe("12025550134");
    expect(toFullPhone("12025550134", CUSTOM_COUNTRY)).toBe("12025550134");
  });
});

describe("grouping as it is typed", () => {
  it("spaces a number into the country's reading groups", () => {
    expect(formatNational("907661770", findCountry("UZ"))).toBe("90 766 17 70");
    expect(formatNational("700123456", findCountry("KG"))).toBe("700 123 456");
  });

  it("groups a half-typed number without waiting for the rest", () => {
    expect(formatNational("9076", findCountry("UZ"))).toBe("90 76");
  });

  it("still shows digits that run past the declared groups", () => {
    expect(formatNational("123456789012345", CUSTOM_COUNTRY)).toBe(
      "123 456 789 012 345"
    );
  });
});
