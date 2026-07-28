import { cn } from "@repo/design-system/lib/utils";
import { Ellipsis } from "lucide-react";
import { Slot } from "radix-ui";

function Breadcrumb({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      aria-label="breadcrumb"
      className={cn("flex h-5.5 shrink-0 items-center text-caption", className)}
      data-slot="breadcrumb"
      {...props}
    />
  );
}

function BreadcrumbList({ className, ...props }: React.ComponentProps<"ol">) {
  return (
    <ol
      className={cn(
        "flex items-center gap-0.5 text-muted-foreground",
        className
      )}
      data-slot="breadcrumb-list"
      {...props}
    />
  );
}

function BreadcrumbItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      className={cn("inline-flex items-center", className)}
      data-slot="breadcrumb-item"
      {...props}
    />
  );
}

function BreadcrumbLink({
  asChild,
  className,
  ...props
}: React.ComponentProps<"a"> & {
  asChild?: boolean;
}) {
  const Comp = asChild ? Slot.Root : "a";

  return (
    <Comp
      className={cn(
        "cursor-pointer truncate transition-colors hover:text-foreground",
        className
      )}
      data-slot="breadcrumb-link"
      {...props}
    />
  );
}

function BreadcrumbPage({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      aria-current="page"
      aria-disabled="true"
      className={cn("truncate text-foreground", className)}
      data-slot="breadcrumb-page"
      role="link"
      {...props}
    />
  );
}

function BreadcrumbSeparator({
  children,
  className,
  ...props
}: React.ComponentProps<"li">) {
  return (
    <li
      aria-hidden="true"
      className={cn(
        "text-muted-foreground/50 [&>svg]:h-3 [&>svg]:w-3",
        className
      )}
      data-slot="breadcrumb-separator"
      role="presentation"
      {...props}
    >
      {children ?? "/"}
    </li>
  );
}

function BreadcrumbEllipsis({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex h-5 w-5 items-center justify-center text-muted-foreground",
        className
      )}
      data-slot="breadcrumb-ellipsis"
      role="presentation"
      {...props}
    >
      <Ellipsis className="h-3.5 w-3.5" />
      <span className="sr-only">More</span>
    </span>
  );
}

export {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
};
