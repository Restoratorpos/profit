"use client";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@repo/design-system/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { type ChangeEvent, useLayoutEffect, useRef, useState } from "react";
import {
  COUNTRIES,
  type Country,
  caretAfterDigits,
  DEFAULT_COUNTRY_CODE,
  findCountry,
  formatNational,
  toFullPhone,
  toNationalDigits,
} from "../lib/countries";
import { normalizePhone } from "../lib/phone";
import { FlagIcon } from "./flag-icon";

interface PhoneFieldProperties {
  disabled?: boolean;
  id?: string;
  invalid?: boolean;
  /** Name of the hidden input carrying the assembled number. */
  name?: string;
}

/**
 * Country selector + national number, submitted as one value.
 *
 * State is bare digits; the input only *displays* them grouped. The hidden
 * input carries the assembled number so the surrounding form keeps reading a
 * single `phone` field off FormData, exactly as it did before.
 */
export const PhoneField = ({
  disabled,
  id = "phone",
  invalid,
  name = "phone",
}: PhoneFieldProperties) => {
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE);
  const [national, setNational] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  /** Caret position to restore after a reformat; null when there is nothing to do. */
  const caretRef = useRef<number | null>(null);

  const country = findCountry(countryCode);

  // Re-rendering replaces the whole input value, which parks the caret at the
  // end. Restoring it here is what makes editing the middle of a number work.
  useLayoutEffect(() => {
    const caret = caretRef.current;

    if (caret !== null && inputRef.current) {
      inputRef.current.setSelectionRange(caret, caret);
      caretRef.current = null;
    }
  });

  const handleCountryChange = (nextCode: string) => {
    const nextCountry = findCountry(nextCode);

    setCountryCode(nextCode);
    // Re-trim rather than clear: switching UZ -> TM must not silently keep a
    // 9-digit number in a field that only accepts 8.
    setNational((current) => toNationalDigits(current, nextCountry));
  };

  const handleNationalChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { value, selectionStart } = event.target;
    const caret = selectionStart ?? value.length;

    // Count in digits, not characters — the spaces move as the number grows.
    const digitsBeforeCaret = normalizePhone(value.slice(0, caret)).length;
    const digits = toNationalDigits(value, country);

    caretRef.current = caretAfterDigits(
      formatNational(digits, country),
      digitsBeforeCaret
    );

    setNational(digits);
  };

  return (
    <>
      <input name={name} type="hidden" value={toFullPhone(national, country)} />
      <InputGroup>
        <InputGroupAddon align="inline-start" className="pr-0">
          <Select
            disabled={disabled}
            onValueChange={handleCountryChange}
            value={countryCode}
          >
            <SelectTrigger
              aria-label="Country"
              className="h-11 border-0 bg-transparent pr-2 pl-3 shadow-none focus-visible:ring-0 dark:bg-transparent dark:hover:bg-transparent"
              size="sm"
            >
              <SelectValue>
                <FlagIcon
                  className="h-4 w-6 shrink-0"
                  code={country.code}
                />
                <span className="text-foreground">+{country.dialCode}</span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {COUNTRIES.map((option: Country) => (
                  <SelectItem key={option.code} value={option.code}>
                    <FlagIcon
                      className="h-4 w-6 shrink-0"
                      code={option.code}
                    />
                    <span>{option.name}</span>
                    <span className="text-muted-foreground">
                      +{option.dialCode}
                    </span>
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </InputGroupAddon>
        <InputGroupInput
          aria-invalid={invalid}
          autoComplete="tel-national"
          disabled={disabled}
          id={id}
          inputMode="tel"
          onChange={handleNationalChange}
          placeholder={country.example}
          ref={inputRef}
          type="tel"
          value={formatNational(national, country)}
        />
      </InputGroup>
    </>
  );
};
