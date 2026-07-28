import { cn } from "@repo/design-system/lib/utils";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium text-body outline-none transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg:not([class*='size-'])]:size-5 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        toolbar: "text-muted-foreground hover:bg-accent hover:text-foreground",
        link: "text-primary-accent underline-offset-4 hover:underline",
      },
      /* Heights are touch targets, not decoration: `default` is the 48px
         baseline and `sm` is the smallest size that still clears the 44px
         minimum. `xs` is below it and is reserved for controls that sit inside
         another target (a clear button inside a field) — never for a standalone
         action on a touchscreen. */
      size: {
        default: "h-12 px-5 has-[>svg]:px-4",
        sm: "h-11 gap-1.5 px-4 has-[>svg]:px-3",
        xs: "h-9 gap-1 px-3 text-caption has-[>svg]:px-2 [&_svg:not([class*='size-'])]:size-4",
        lg: "h-14 px-7 text-lg has-[>svg]:px-6 [&_svg:not([class*='size-'])]:size-6",
        icon: "h-12 w-12",
        "icon-sm": "h-11 w-11",
        "icon-xs": "h-9 w-9 [&_svg:not([class*='size-'])]:size-4",
        "icon-lg": "h-14 w-14 [&_svg:not([class*='size-'])]:size-6",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      data-size={size}
      data-slot="button"
      data-variant={variant}
      {...props}
    />
  );
}

export { Button, buttonVariants };
