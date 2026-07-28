"use client";

import { cn } from "@repo/design-system/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { Avatar as AvatarPrimitive } from "radix-ui";
import type * as React from "react";

const avatarVariants = cva(
  "group/avatar relative flex shrink-0 select-none overflow-hidden rounded-full",
  {
    variants: {
      size: {
        xs: "h-5 w-5",
        sm: "h-5.5 w-5.5",
        default: "h-6.5 w-6.5",
        lg: "h-7 w-7",
        xl: "h-8 w-8",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
);

type AvatarSize = NonNullable<VariantProps<typeof avatarVariants>["size"]>;

function Avatar({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root> & {
  size?: AvatarSize;
}) {
  return (
    <AvatarPrimitive.Root
      className={cn(avatarVariants({ size }), className)}
      data-size={size}
      data-slot="avatar"
      {...props}
    />
  );
}

function AvatarImage({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      className={cn("aspect-square h-full w-full", className)}
      data-slot="avatar-image"
      {...props}
    />
  );
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      className={cn(
        "flex h-full w-full items-center justify-center rounded-full bg-muted font-medium text-[11px] text-muted-foreground leading-none",
        "group-data-[size=xs]/avatar:text-[9px]",
        "group-data-[size=sm]/avatar:text-[9px]",
        "group-data-[size=default]/avatar:text-[10px]",
        "group-data-[size=lg]/avatar:text-[11px]",
        "group-data-[size=xl]/avatar:text-[12px]",
        className
      )}
      data-slot="avatar-fallback"
      {...props}
    />
  );
}

function AvatarBadge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "absolute right-0 bottom-0 z-10 inline-flex select-none items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background",
        "group-data-[size=xs]/avatar:h-1.5 group-data-[size=xs]/avatar:w-1.5 group-data-[size=xs]/avatar:[&>svg]:hidden",
        "group-data-[size=sm]/avatar:h-2 group-data-[size=sm]/avatar:w-2 group-data-[size=sm]/avatar:[&>svg]:hidden",
        "group-data-[size=default]/avatar:h-2.5 group-data-[size=default]/avatar:w-2.5 group-data-[size=default]/avatar:[&>svg]:size-2",
        "group-data-[size=lg]/avatar:h-2.5 group-data-[size=lg]/avatar:w-2.5 group-data-[size=lg]/avatar:[&>svg]:size-2",
        "group-data-[size=xl]/avatar:h-3 group-data-[size=xl]/avatar:w-3 group-data-[size=xl]/avatar:[&>svg]:size-2",
        className
      )}
      data-slot="avatar-badge"
      {...props}
    />
  );
}

function AvatarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "group/avatar-group flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-background",
        className
      )}
      data-slot="avatar-group"
      {...props}
    />
  );
}

function AvatarGroupCount({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "relative flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] text-muted-foreground ring-2 ring-background [&>svg]:size-4",
        "group-has-data-[size=xs]/avatar-group:h-5 group-has-data-[size=xs]/avatar-group:w-5 group-has-data-[size=xs]/avatar-group:text-[10px] group-has-data-[size=xs]/avatar-group:[&>svg]:size-3",
        "group-has-data-[size=sm]/avatar-group:h-5.5 group-has-data-[size=sm]/avatar-group:w-5.5 group-has-data-[size=sm]/avatar-group:text-[10px] group-has-data-[size=sm]/avatar-group:[&>svg]:size-3",
        "group-has-data-[size=lg]/avatar-group:h-7 group-has-data-[size=lg]/avatar-group:w-7 group-has-data-[size=lg]/avatar-group:text-[12px] group-has-data-[size=lg]/avatar-group:[&>svg]:size-4",
        "group-has-data-[size=xl]/avatar-group:h-8 group-has-data-[size=xl]/avatar-group:w-8 group-has-data-[size=xl]/avatar-group:text-[13px] group-has-data-[size=xl]/avatar-group:[&>svg]:size-5",
        className
      )}
      data-slot="avatar-group-count"
      {...props}
    />
  );
}

export type { AvatarSize };
export {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
  avatarVariants,
};
