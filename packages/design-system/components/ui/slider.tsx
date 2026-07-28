"use client";

import { cn } from "@repo/design-system/lib/utils";
import { Slider as SliderPrimitive } from "radix-ui";

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  const _values = value ?? defaultValue ?? [min];

  return (
    <SliderPrimitive.Root
      className={cn(
        "relative flex w-full touch-none select-none items-center data-disabled:opacity-50",
        className
      )}
      data-slot="slider"
      defaultValue={defaultValue}
      max={max}
      min={min}
      value={value}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted">
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      {_values.map((_, i) => (
        <SliderPrimitive.Thumb
          className="block size-4 shrink-0 rounded-full border border-primary/50 bg-primary shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none"
          key={`thumb-${i}`}
        />
      ))}
    </SliderPrimitive.Root>
  );
}

export { Slider };
