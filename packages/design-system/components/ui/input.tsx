import { cn } from "@repo/design-system/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        // The `md:text-sm` step-down the shadcn default ships with exists to
        // dodge iOS's zoom-on-focus below 16px; the whole scale is above that
        // now, so the field keeps one size at every width.
        "h-12 w-full min-w-0 rounded-lg border border-input bg-transparent px-3.5 py-2 text-base shadow-xs outline-none transition-[color,box-shadow] selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-9 file:border-0 file:bg-transparent file:font-medium file:text-base file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:ring-destructive/40",
        className
      )}
      data-slot="input"
      type={type}
      {...props}
    />
  );
}

export { Input };
