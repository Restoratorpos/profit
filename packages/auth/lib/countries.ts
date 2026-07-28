import { normalizePhone } from "./phone";

/**
 * The countries this product serves: Central Asia plus Russia.
 *
 * Keyed by ISO code, **not** dial code — Kazakhstan and Russia both dial +7, so
 * a dial-code key would collide and make the two indistinguishable in a select.
 */
export interface Country {
  /** ISO 3166-1 alpha-2. Unique, so it is what the <Select> stores, and what
   * `FlagIcon` draws. */
  code: string;
  /** Digits only, no "+". */
  dialCode: string;
  /** Sample national number, shown as the input placeholder. */
  example: string;
  /** Digit-group sizes used to space the number as it is typed. Must sum to
   * `nationalLength`. */
  groups: readonly number[];
  name: string;
  /** Digits after the dial code. Used for both trimming and validation. */
  nationalLength: number;
}

export const COUNTRIES: readonly Country[] = [
  {
    code: "UZ",
    name: "Uzbekistan",
    dialCode: "998",
    nationalLength: 9,
    groups: [2, 3, 2, 2],
    example: "90 766 17 70",
  },
  {
    code: "KZ",
    name: "Kazakhstan",
    dialCode: "7",
    nationalLength: 10,
    groups: [3, 3, 2, 2],
    example: "701 234 56 78",
  },
  {
    code: "KG",
    name: "Kyrgyzstan",
    dialCode: "996",
    nationalLength: 9,
    groups: [3, 3, 3],
    example: "700 123 456",
  },
  {
    code: "TJ",
    name: "Tajikistan",
    dialCode: "992",
    nationalLength: 9,
    groups: [2, 3, 2, 2],
    example: "90 123 45 67",
  },
  {
    code: "TM",
    name: "Turkmenistan",
    dialCode: "993",
    nationalLength: 8,
    groups: [2, 3, 3],
    example: "65 123 456",
  },
  {
    code: "RU",
    name: "Russia",
    dialCode: "7",
    nationalLength: 10,
    groups: [3, 3, 2, 2],
    example: "912 345 67 89",
  },
] as const;

export const DEFAULT_COUNTRY_CODE = "UZ";

const FALLBACK = COUNTRIES[0] as Country;

export const findCountry = (code: string): Country =>
  COUNTRIES.find((country) => country.code === code) ?? FALLBACK;

/**
 * Cleans whatever landed in the input down to the national part.
 *
 * The dial code is only stripped when the digits are longer than a national
 * number can be, which is what makes pasting a full "+998 88 216 75 55" work
 * without breaking Kazakh numbers — those legitimately start with the same 7
 * they dial with.
 */
export const toNationalDigits = (raw: string, country: Country): string => {
  const digits = normalizePhone(raw);

  const withoutDialCode =
    digits.length > country.nationalLength &&
    digits.startsWith(country.dialCode)
      ? digits.slice(country.dialCode.length)
      : digits;

  return withoutDialCode.slice(0, country.nationalLength);
};

/**
 * Spaces the national number into the country's reading groups
 * (`907661770` → `90 766 17 70`). Display only — never store or send this.
 */
export const formatNational = (national: string, country: Country): string => {
  const digits = normalizePhone(national);
  const parts: string[] = [];
  let index = 0;

  for (const size of country.groups) {
    if (index >= digits.length) {
      break;
    }

    parts.push(digits.slice(index, index + size));
    index += size;
  }

  // Anything past the declared groups still shows, rather than vanishing.
  if (index < digits.length) {
    parts.push(digits.slice(index));
  }

  return parts.join(" ");
};

/*
 * Longest dial code first. "998" and "7" both prefix a stored Uzbek number, and
 * testing the short one first would match it to Kazakhstan and then reject it
 * on length — correct by luck rather than by construction. Sorted once here
 * rather than on every call.
 */
const BY_DIAL_CODE_LENGTH = [...COUNTRIES].sort(
  (a, b) => b.dialCode.length - a.dialCode.length
);

const displayCache = new Map<string, string>();

/**
 * A stored number as it should be read: `998907661770` → `+998 90 766 17 70`.
 *
 * Display only, like `formatNational` — what is stored, searched and sent stays
 * bare digits. A number whose length does not match any country we serve is
 * returned as-is: showing the raw digits is honest, whereas grouping them under
 * a guessed country would invent structure that is not there.
 *
 * Cached because tables call it once per row and the same numbers recur across
 * re-renders; the input is a short string and the set of them is bounded by the
 * gym's roster.
 */
export const formatPhone = (stored: string | null | undefined): string => {
  const digits = normalizePhone(stored ?? "");

  if (digits.length === 0) {
    return "";
  }

  const cached = displayCache.get(digits);

  if (cached !== undefined) {
    return cached;
  }

  const country = BY_DIAL_CODE_LENGTH.find(
    (candidate) =>
      digits.startsWith(candidate.dialCode) &&
      digits.length === candidate.dialCode.length + candidate.nationalLength
  );

  const formatted = country
    ? `+${country.dialCode} ${formatNational(
        digits.slice(country.dialCode.length),
        country
      )}`
    : digits;

  displayCache.set(digits, formatted);

  return formatted;
};

/**
 * Where the caret belongs in a formatted string after `digitCount` digits.
 *
 * Reformatting rewrites the whole input value, which would otherwise throw the
 * caret to the end on every keystroke — so edits in the middle of a number
 * become impossible. Counting digits rather than characters keeps the caret
 * anchored to the digit the user was actually on, whatever spaces moved around
 * it.
 */
export const caretAfterDigits = (
  formatted: string,
  digitCount: number
): number => {
  if (digitCount <= 0) {
    return 0;
  }

  let seen = 0;

  for (let index = 0; index < formatted.length; index++) {
    if (
      formatted.charCodeAt(index) >= 48 &&
      formatted.charCodeAt(index) <= 57
    ) {
      seen += 1;

      if (seen === digitCount) {
        return index + 1;
      }
    }
  }

  return formatted.length;
};

/** Bare digits, exactly as the backend stores and compares them. */
export const toFullPhone = (national: string, country: Country): string =>
  `${country.dialCode}${normalizePhone(national)}`;

export const isCompleteNational = (
  national: string,
  country: Country
): boolean => normalizePhone(national).length === country.nationalLength;

/**
 * Validates an assembled number against the countries above, so a caller only
 * holding the submitted value can still check it. A bare length range would
 * accept a Turkmen number one digit short of an Uzbek one.
 */
export const isSupportedPhone = (phone: string): boolean => {
  const digits = normalizePhone(phone);

  return COUNTRIES.some(
    (country) =>
      digits.startsWith(country.dialCode) &&
      digits.length === country.dialCode.length + country.nationalLength
  );
};
