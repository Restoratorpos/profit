"use client";

import { useState } from "react";
import { cn } from "../../lib/utils";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";

/**
 * A time field: two Selects, hours and minutes.
 *
 * Replaces `<input type="time">` for the same reason DatePicker replaces
 * `type="date"` — the native control is drawn by the browser, so it ignores the
 * theme and is a different shape everywhere. Two Selects also beat a text box on
 * a touchscreen, where the alternative is a keyboard for four digits.
 *
 * Minutes step by five rather than by one. A shift starts at 09:00 or 09:30, not
 * 09:07, and sixty rows is a scroll where twelve is a glance. Pass `minuteStep`
 * where that is wrong.
 */

const HOURS = Array.from({ length: 24 }, (_, index) =>
  String(index).padStart(2, "0")
);

const pad = (value: number): string => String(value).padStart(2, "0");

/** `"09:30"` -> `["09", "30"]`, falling back rather than throwing on rubbish. */
const split = (value: string): [string, string] => {
  const [hour = "00", minute = "00"] = value.split(":");

  return [hour.padStart(2, "0"), minute.padStart(2, "0")];
};

export interface TimePickerProperties {
  /** For fields with no visible <FieldLabel>. */
  "aria-label"?: string;
  className?: string;
  /** Uncontrolled starting value. Pair with `name` to submit via FormData. */
  defaultValue?: string;
  disabled?: boolean;
  id?: string;
  /** Granularity of the minutes column. Five by default. */
  minuteStep?: number;
  /** Submits `HH:mm` in a hidden input, as the native field did. */
  name?: string;
  onChange?: (value: string) => void;
  /** `HH:mm`. Omit for an uncontrolled field. */
  value?: string;
}

export const TimePicker = ({
  "aria-label": ariaLabel,
  className,
  defaultValue = "09:00",
  disabled,
  id,
  minuteStep = 5,
  name,
  onChange,
  value,
}: TimePickerProperties) => {
  const [internal, setInternal] = useState(defaultValue);
  const current = value ?? internal;
  const [hour, minute] = split(current);

  const minutes = Array.from(
    { length: Math.ceil(60 / minuteStep) },
    (_, index) => pad(index * minuteStep)
  );

  const commit = (next: string) => {
    setInternal(next);
    onChange?.(next);
  };

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Select
        disabled={disabled}
        onValueChange={(next) => commit(`${next}:${minute}`)}
        value={hour}
      >
        <SelectTrigger aria-label={ariaLabel} className="w-full" id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {HOURS.map((entry) => (
              <SelectItem key={entry} value={entry}>
                {entry}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      <span aria-hidden="true" className="text-muted-foreground">
        :
      </span>

      <Select
        disabled={disabled}
        onValueChange={(next) => commit(`${hour}:${next}`)}
        value={minute}
      >
        <SelectTrigger aria-label={ariaLabel} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {minutes.map((entry) => (
              <SelectItem key={entry} value={entry}>
                {entry}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      {name ? <input name={name} type="hidden" value={current} /> : null}
    </div>
  );
};
