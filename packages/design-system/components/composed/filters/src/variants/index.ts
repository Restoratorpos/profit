import { cva } from "class-variance-authority";

// Reusable input variant component for consistent styling
const filterInputVariants = cva(
  [
    "relative flex shrink-0 items-center text-foreground outline-none transition",
    "has-[[data-slot=filters-input]:focus-visible]:ring-ring/30",
    "has-[[data-slot=filters-input]:focus-visible]:border-ring",
    "has-[[data-slot=filters-input]:focus-visible]:outline-none",
    "has-[[data-slot=filters-input]:focus-visible]:ring-[3px]",
    "has-[[data-slot=filters-input]:focus-visible]:z-1",
    "has-[[data-slot=filters-input]:[aria-invalid=true]]:border",
    "has-[[data-slot=filters-input]:[aria-invalid=true]]:border-solid",
    "has-[[data-slot=filters-input]:[aria-invalid=true]]:border-destructive/60",
    "has-[[data-slot=filters-input]:[aria-invalid=true]]:ring-destructive/10",
    "dark:has-[[data-slot=filters-input]:[aria-invalid=true]]:border-destructive",
    "dark:has-[[data-slot=filters-input]:[aria-invalid=true]]:ring-destructive/20",
  ],
  {
    variants: {
      variant: {
        solid: "border-0 bg-secondary",
        outline: "border border-border bg-background",
      },
      size: {
        lg: "h-10 px-2.5 text-sm has-[[data-slot=filters-prefix]]:ps-0 has-[[data-slot=filters-suffix]]:pe-0",
        md: "h-8 px-2 text-sm has-[[data-slot=filters-prefix]]:ps-0 has-[[data-slot=filters-suffix]]:pe-0",
        sm: "h-6.5 px-1.5 text-xs has-[[data-slot=filters-prefix]]:ps-0 has-[[data-slot=filters-suffix]]:pe-0",
      },
      cursorPointer: {
        true: "cursor-pointer",
        false: "",
      },
    },
    defaultVariants: {
      variant: "outline",
      size: "md",
      cursorPointer: true,
    },
  }
);

// Reusable remove button variant component
const filterRemoveButtonVariants = cva(
  [
    "inline-flex shrink-0 shrink-0 items-center justify-center text-muted-foreground transition hover:text-foreground",
  ],
  {
    variants: {
      variant: {
        solid: "bg-secondary",
        outline: "border border-border border-s-0 hover:bg-secondary",
      },
      size: {
        lg: "h-10 w-10 [&_svg:not([class*=size-])]:size-4",
        md: "h-8 w-8 [&_svg:not([class*=size-])]:size-3.5",
        sm: "h-6.5 w-6.5 [&_svg:not([class*=size-])]:size-3",
      },
      cursorPointer: {
        true: "cursor-pointer",
        false: "",
      },
      radius: {
        md: "rounded-e-md",
        full: "rounded-e-full",
      },
    },
    defaultVariants: {
      variant: "outline",
      size: "md",
      radius: "md",
      cursorPointer: true,
    },
  }
);

const filterAddButtonVariants = cva(
  [
    "inline-flex shrink-0 shrink-0 items-center justify-center text-foreground shadow-black/5 shadow-xs transition",
    "[&_svg:not([role=img]):not([class*=text-]):not([class*=opacity-])]:opacity-60",
  ],
  {
    variants: {
      variant: {
        solid: "border border-input hover:bg-secondary/60",
        outline: "border border-border hover:bg-secondary",
      },
      size: {
        lg: "h-10 gap-1.5 px-4 text-sm [&_svg:not([class*=size-])]:size-4",
        md: "h-8 gap-1.5 px-3 text-sm [&_svg:not([class*=size-])]:size-4",
        sm: "h-6.5 gap-1.25 px-2.5 text-xs [&_svg:not([class*=size-])]:size-3.5",
      },
      radius: {
        md: "rounded-md",
        full: "rounded-full",
      },
      cursorPointer: {
        true: "cursor-pointer",
        false: "",
      },
    },
    defaultVariants: {
      variant: "outline",
      size: "md",
      cursorPointer: true,
    },
  }
);

const filterOperatorVariants = cva(
  [
    "relative flex shrink-0 items-center text-muted-foreground transition hover:text-foreground focus-visible:z-1 data-[state=open]:text-foreground",
  ],
  {
    variants: {
      variant: {
        solid: "bg-secondary",
        outline:
          "border border-border border-e-0 bg-background hover:bg-secondary data-[state=open]:bg-secondary [&+[data-slot=filters-remove]]:border-s",
      },
      size: {
        lg: "h-10 gap-1.5 px-4 text-sm",
        md: "h-8 gap-1.25 px-3 text-sm",
        sm: "h-6.5 gap-1 px-2.5 text-xs",
      },
      cursorPointer: {
        true: "cursor-pointer",
        false: "",
      },
    },
    defaultVariants: {
      variant: "outline",
      size: "md",
      cursorPointer: true,
    },
  }
);

const filterFieldLabelVariants = cva(
  [
    "flex shrink-0 items-center gap-1.5 px-1.5 py-1 text-foreground",
    "[&_svg:not([class*=opacity-])]:opacity-60 [&_svg:not([class*=size-])]:size-3.5",
  ],
  {
    variants: {
      variant: {
        solid: "bg-secondary",
        outline: "border border-border border-e-0",
      },
      size: {
        lg: "h-10 gap-1.5 px-4 text-sm [&_svg:not([class*=size-])]:size-4",
        md: "h-8 gap-1.5 px-3 text-sm [&_svg:not([class*=size-])]:size-4",
        sm: "h-6.5 gap-1.25 px-2.5 text-xs [&_svg:not([class*=size-])]:size-3.5",
      },
      radius: {
        md: "rounded-s-md",
        full: "rounded-s-full",
      },
    },
    defaultVariants: {
      variant: "outline",
      size: "md",
    },
  }
);

const filterFieldValueVariants = cva(
  "relative flex shrink-0 items-center gap-1 text-foreground transition focus-visible:z-1",
  {
    variants: {
      variant: {
        solid: "bg-secondary",
        outline:
          "border border-border bg-background hover:bg-secondary has-[[data-slot=switch]]:hover:bg-transparent",
      },
      size: {
        lg: "h-10 gap-1.5 px-4 text-sm [&_svg:not([class*=size-])]:size-4",
        md: "h-8 gap-1.5 px-3 text-sm [&_svg:not([class*=size-])]:size-4",
        sm: "h-6.5 gap-1.25 px-2.5 text-xs [&_svg:not([class*=size-])]:size-3.5",
      },
      cursorPointer: {
        true: "cursor-pointer has-[[data-slot=switch]]:cursor-default",
        false: "",
      },
    },
    defaultVariants: {
      variant: "outline",
      size: "md",
      cursorPointer: true,
    },
  }
);

const filterFieldAddonVariants = cva(
  "flex shrink-0 items-center justify-center text-foreground",
  {
    variants: {
      variant: {
        solid: "",
        outline: "",
      },
      size: {
        lg: "h-10 px-4 text-sm",
        md: "h-8 px-3 text-sm",
        sm: "h-6.5 px-2.5 text-xs",
      },
    },
    defaultVariants: {
      variant: "outline",
      size: "md",
    },
  }
);

const filterFieldBetweenVariants = cva(
  "flex shrink-0 items-center text-muted-foreground",
  {
    variants: {
      variant: {
        solid: "bg-secondary",
        outline: "border border-border border-x-0 bg-background",
      },
      size: {
        lg: "h-10 px-4 text-sm",
        md: "h-8 px-3 text-sm",
        sm: "h-6.5 px-2.5 text-xs",
      },
    },
    defaultVariants: {
      variant: "outline",
      size: "md",
    },
  }
);

const filtersContainerVariants = cva("flex flex-wrap items-center", {
  variants: {
    variant: {
      solid: "gap-2",
      outline: "",
    },
    size: {
      sm: "gap-1.5",
      md: "gap-2.5",
      lg: "gap-3.5",
    },
  },
  defaultVariants: {
    variant: "outline",
    size: "md",
  },
});

const filterItemVariants = cva("flex items-center shadow-black/5 shadow-xs", {
  variants: {
    variant: {
      solid: "gap-px",
      outline: "",
    },
  },
  defaultVariants: {
    variant: "outline",
  },
});

export {
  filterAddButtonVariants,
  filterFieldAddonVariants,
  filterFieldBetweenVariants,
  filterFieldLabelVariants,
  filterFieldValueVariants,
  filterInputVariants,
  filterItemVariants,
  filterOperatorVariants,
  filterRemoveButtonVariants,
  filtersContainerVariants,
};
