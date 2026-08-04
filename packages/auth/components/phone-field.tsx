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
  type Country,
  CUSTOM_COUNTRY_CODE,
  caretAfterDigits,
  findCountry,
  formatNational,
  SELECTABLE_COUNTRIES,
  splitPhone,
  toFullPhone,
  toNationalDigits,
} from "../lib/countries";
import { normalizePhone } from "../lib/phone";
import { FlagIcon } from "./flag-icon";

interface PhoneFieldProperties {
  /**
   * How "Other country" is named in the operator's language. The list of real
   * countries is in English by convention; this one is a word rather than a
   * place, so an app with a dictionary should pass its own.
   */
  customLabel?: string;
  /**
   * A stored number in bare digits, split back into country and national parts
   * on mount. Uncontrolled from then on — like `defaultValue` anywhere else, so
   * the field is keyed by the record the form is editing.
   */
  defaultValue?: string;
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
  customLabel,
  defaultValue,
  disabled,
  id = "phone",
  invalid,
  name = "phone",
}: PhoneFieldProperties) => {
  /* Split once, on mount: after that the two halves are this component's. */
  const [seed] = useState(() => splitPhone(defaultValue));
  const [countryCode, setCountryCode] = useState(seed.countryCode);
  const [national, setNational] = useState(seed.national);

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
    setNational((current) => {
      /*
       * Into "Other country" the dial code stops being the picker's and becomes
       * part of what is typed, so it moves into the box. Without this, choosing
       * it would silently delete the +998 the number already had.
       */
      const carried =
        nextCountry.code === CUSTOM_COUNTRY_CODE
          ? `${country.dialCode}${current}`
          : current;

      // Re-trim rather than clear: switching UZ -> TM must not silently keep a
      // 9-digit number in a field that only accepts 8.
      return toNationalDigits(carried, nextCountry);
    });
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

  const isCustom = country.code === CUSTOM_COUNTRY_CODE;

  return (
    <>
      {/* An empty box submits nothing, not a lone dial code: "998" is not a
          number anybody has, and a form checking whether a phone was given
          would have counted those three digits as one. */}
      <input
        name={name}
        type="hidden"
        value={national === "" ? "" : toFullPhone(national, country)}
      />
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
                <FlagIcon className="h-4 w-6 shrink-0" code={country.code} />
                {/* Under "Other country" the dial code is part of what the
                    operator is typing, so the trigger claims none: a bare "+"
                    in front of a number that already carries one reads as a
                    mistake. */}
                {isCustom ? null : (
                  <span className="text-foreground">+{country.dialCode}</span>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {SELECTABLE_COUNTRIES.map((option: Country) => (
                  <SelectItem key={option.code} value={option.code}>
                    <FlagIcon className="h-4 w-6 shrink-0" code={option.code} />
                    <span>
                      {option.code === CUSTOM_COUNTRY_CODE
                        ? (customLabel ?? option.name)
                        : option.name}
                    </span>
                    {option.dialCode === "" ? null : (
                      <span className="text-muted-foreground">
                        +{option.dialCode}
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </InputGroupAddon>
        <InputGroupInput
          aria-invalid={invalid}
          autoComplete={isCustom ? "tel" : "tel-national"}
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
