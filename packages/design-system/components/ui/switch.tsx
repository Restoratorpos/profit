"use client";

import { cn } from "@repo/design-system/lib/utils";
import { Switch as SwitchPrimitive } from "radix-ui";

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "peer relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-xs transition-colors after:absolute after:-inset-x-2 after:-inset-y-2.5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
        className
      )}
      data-slot="switch"
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none block size-7 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-6 data-[state=unchecked]:translate-x-0 data-[state=checked]:bg-white"
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
