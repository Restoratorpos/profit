"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { CheckIcon, XIcon } from "lucide-react";
import { PRODUCT_COLORS, readableTextOn } from "@/lib/catalog";

interface ColorPickerProperties {
  disabled?: boolean;
  label: string;
  noneLabel: string;
  onChange: (next: string | null) => void;
  value: string | null;
}

/** The row of tile-background swatches, plus an "x" that clears the choice. */
export const ColorPicker = ({
  disabled,
  label,
  noneLabel,
  onChange,
  value,
}: ColorPickerProperties) => (
  <div
    aria-label={label}
    className="flex flex-wrap items-center gap-2"
    role="radiogroup"
  >
    {PRODUCT_COLORS.map((color) => {
      const active = value?.toLowerCase() === color.toLowerCase();

      return (
        <Button
          aria-checked={active}
          aria-label={color}
          className={cn(
            "size-7 rounded-full p-0 ring-foreground ring-offset-2 ring-offset-background hover:opacity-90",
            active && "ring-2"
          )}
          disabled={disabled}
          key={color}
          onClick={() => onChange(color)}
          role="radio"
          size="icon"
          style={{ backgroundColor: color, color: readableTextOn(color) }}
          type="button"
          variant="ghost"
        >
          {active ? <CheckIcon className="size-4" /> : null}
        </Button>
      );
    })}

    <Button
      aria-checked={value === null}
      aria-label={noneLabel}
      className={cn(
        "size-7 rounded-full ring-foreground ring-offset-2 ring-offset-background",
        value === null && "ring-2"
      )}
      disabled={disabled}
      onClick={() => onChange(null)}
      role="radio"
      size="icon"
      type="button"
      variant="outline"
    >
      <XIcon className="size-4" />
    </Button>
  </div>
);
