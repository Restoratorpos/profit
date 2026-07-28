import {
  COUNTRIES,
  caretAfterDigits,
  findCountry,
  formatNational,
  isSupportedPhone,
  toFullPhone,
  toNationalDigits,
} from "@repo/auth/lib/countries";
import { describe, expect, it } from "vitest";

const uz = findCountry("UZ");
const kz = findCountry("KZ");
const tm = findCountry("TM");

describe("country list", () => {
  it("keys Kazakhstan and Russia separately despite sharing +7", () => {
    const sevens = COUNTRIES.filter((c) => c.dialCode === "7");

    expect(sevens.map((c) => c.code).sort()).toEqual(["KZ", "RU"]);
  });

  it("has a unique ISO code per entry", () => {
    const codes = COUNTRIES.map((c) => c.code);

    expect(new Set(codes).size).toBe(codes.length);
  });

  it("has digit groups summing to the national length", () => {
    for (const country of COUNTRIES) {
      const total = country.groups.reduce((sum, size) => sum + size, 0);

      expect(`${country.code}:${total}`).toBe(
        `${country.code}:${country.nationalLength}`
      );
    }
  });

  it("has an example matching its own format", () => {
    for (const country of COUNTRIES) {
      expect(`${country.code}:${country.example}`).toBe(
        `${country.code}:${formatNational(country.example, country)}`
      );
    }
  });
});

describe("formatNational", () => {
  it("groups an Uzbek number 2-3-2-2", () => {
    expect(formatNational("907661770", uz)).toBe("90 766 17 70");
  });

  it("groups a Kyrgyz number 3-3-3", () => {
    expect(formatNational("700123456", findCountry("KG"))).toBe("700 123 456");
  });

  it("formats a partial number without trailing separators", () => {
    expect(formatNational("9076", uz)).toBe("90 76");
    expect(formatNational("90", uz)).toBe("90");
  });

  it("returns nothing for no digits", () => {
    expect(formatNational("", uz)).toBe("");
  });
});

describe("caretAfterDigits", () => {
  it("places the caret after the nth digit, skipping spaces", () => {
    expect(caretAfterDigits("90 766 17 70", 2)).toBe(2);
    expect(caretAfterDigits("90 766 17 70", 3)).toBe(4);
    expect(caretAfterDigits("90 766 17 70", 5)).toBe(6);
  });

  it("clamps to the ends", () => {
    expect(caretAfterDigits("90 766", 0)).toBe(0);
    expect(caretAfterDigits("90 766", 99)).toBe(6);
  });
});

describe("toNationalDigits", () => {
  it("keeps digits only", () => {
    expect(toNationalDigits("90 766 17 70", uz)).toBe("907661770");
  });

  it("strips a pasted full number including the dial code", () => {
    expect(toNationalDigits("+998 88 216 75 55", uz)).toBe("882167555");
  });

  it("does not strip the leading 7 of a valid Kazakh national number", () => {
    // KZ dials +7 and its national numbers also start with 7 — trimming here
    // would silently corrupt the number.
    expect(toNationalDigits("7012345678", kz)).toBe("7012345678");
  });

  it("strips the dial code from a pasted Kazakh number", () => {
    expect(toNationalDigits("+7 701 234 56 78", kz)).toBe("7012345678");
  });

  it("caps at the country's national length", () => {
    expect(toNationalDigits("1234567890123", tm)).toBe("12345678");
  });
});

describe("toFullPhone", () => {
  it("produces the bare digits the backend stores", () => {
    expect(toFullPhone("907661770", uz)).toBe("998907661770");
  });
});

describe("isSupportedPhone", () => {
  it("accepts a complete Uzbek number", () => {
    expect(isSupportedPhone("998907661770")).toBe(true);
  });

  it("rejects an Uzbek number one digit short", () => {
    expect(isSupportedPhone("99890766177")).toBe(false);
  });

  it("accepts a complete Turkmen number", () => {
    expect(isSupportedPhone("99365123456")).toBe(true);
  });

  it("rejects a country outside the supported list", () => {
    // +44 is not offered, so it must not pass just by being a plausible length.
    expect(isSupportedPhone("447911123456")).toBe(false);
  });

  it("accepts human formatting", () => {
    expect(isSupportedPhone("+998 90 766 17 70")).toBe(true);
  });
});
