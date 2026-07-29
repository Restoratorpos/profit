"use client";

import { format, isValid, parse } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/utils";
import { Button } from "./button";
import { Calendar } from "./calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

/**
 * A date field: a button showing the chosen day, opening the Calendar.
 *
 * shadcn ships `Calendar` and `Popover` as primitives and leaves the date
 * picker to be composed from them per project, which is why this lives here
 * rather than being generated. It replaces `<input type="date">`, whose control
 * is drawn by the browser — it ignores the theme, it is a different shape and
 * size in every browser, and on a touchscreen terminal it opens whatever picker
 * the OS feels like. None of that is acceptable in a design system that
 * otherwise controls its own 48px targets and dark mode.
 *
 * The wire format is `yyyy-MM-dd`, matching what the API sends and expects, so
 * callers keep passing and reading the same strings they always did.
 */

/** What the API speaks. Not a display format — see `displayFormat`. */
const WIRE_FORMAT = "yyyy-MM-dd";

export interface DatePickerProperties {
  /** For fields with no visible <FieldLabel> — a range's two ends, say. */
  "aria-label"?: string;
  className?: string;
  /**
   * Uncontrolled starting value. Pair with `name` to keep reading the field off
   * FormData, exactly as `<input type="date">` was read.
   */
  defaultValue?: string;
  /** Disables the trigger; the popover cannot be opened. */
  disabled?: boolean;
  /** How the chosen day is written on the button. */
  displayFormat?: string;
  id?: string;
  invalid?: boolean;
  /**
   * Submits the value in a hidden input so surrounding forms keep reading a
   * single named field. The same arrangement PhoneField uses.
   */
  name?: string;
  /**
   * Emits `yyyy-MM-dd`, or an empty string when cleared — the same values an
   * `<input type="date">` produced, so call sites do not have to change shape.
   */
  onChange?: (value: string) => void;
  placeholder?: string;
  /** `yyyy-MM-dd`, or empty. Omit for an uncontrolled field. */
  value?: string;
}

const toDate = (value: string): Date | undefined => {
  if (value === "") {
    return;
  }

  const parsed = parse(value, WIRE_FORMAT, new Date());

  return isValid(parsed) ? parsed : undefined;
};

export const DatePicker = ({
  "aria-label": ariaLabel,
  className,
  defaultValue = "",
  disabled,
  displayFormat = "dd MMM yyyy",
  id,
  invalid,
  name,
  onChange,
  placeholder,
  value,
}: DatePickerProperties) => {
  const [open, setOpen] = useState(false);
  /*
   * Held either way. When `value` is supplied the parent owns it and this is
   * ignored; when it is not, this is the value — which is what lets a form keep
   * reading the field off FormData without the page having to manage state for
   * a birthdate it only looks at once, on submit.
   */
  const [internal, setInternal] = useState(defaultValue);
  const current = value ?? internal;
  const selected = toDate(current);

  const commit = (next: string) => {
    setInternal(next);
    onChange?.(next);
  };

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-invalid={invalid}
          aria-label={ariaLabel}
          className={cn(
            "w-full justify-start gap-2 font-normal",
            // A placeholder is not a value, and should not read as one.
            selected ? "" : "text-muted-foreground",
            className
          )}
          disabled={disabled}
          id={id}
          type="button"
          variant="outline"
        >
          <CalendarIcon className="size-4 shrink-0 opacity-70" />
          <span className="truncate">
            {selected ? format(selected, displayFormat) : (placeholder ?? "")}
          </span>
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          autoFocus
          // Years are reachable from the caption rather than by paging twelve
          // months at a time — a birthdate is decades back.
          captionLayout="dropdown"
          mode="single"
          onSelect={(next) => {
            commit(next ? format(next, WIRE_FORMAT) : "");
            // Picking a day is the whole interaction; leaving it open would make
            // every selection cost a second dismissing tap on the terminal.
            setOpen(false);
          }}
          selected={selected}
        />
      </PopoverContent>

      {/* What the surrounding form actually submits, so FormData keeps seeing
          one named field of `yyyy-MM-dd` — the shape it saw from the native
          input this replaced. */}
      {name ? <input name={name} type="hidden" value={current} /> : null}
    </Popover>
  );
};
