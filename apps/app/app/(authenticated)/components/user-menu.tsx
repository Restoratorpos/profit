"use client";

import { signOut, useSession } from "@repo/auth/client";
import { formatPhone } from "@repo/auth/lib/countries";
import {
  Avatar,
  AvatarFallback,
} from "@repo/design-system/components/ui/avatar";
import { Button } from "@repo/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import { LogOutIcon } from "lucide-react";
import type { Messages } from "@/lib/i18n/dictionary";

interface UserMenuProperties {
  messages: Messages;
}

const WHITESPACE = /\s+/;

/** First letters of up to two words — "Ali Valiyev" -> "AV". */
const initialsOf = (name: string): string =>
  name
    .split(WHITESPACE)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";

export const UserMenu = ({ messages }: UserMenuProperties) => {
  const { data: session } = useSession();

  const name = session?.user?.name ?? "";
  const phone = formatPhone(session?.user?.phone);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="h-9 gap-2 px-1.5 font-normal" variant="ghost">
          <span className="hidden text-right leading-tight sm:block">
            <span className="block font-medium text-sm">{name}</span>
            <span className="block text-muted-foreground text-xs">{phone}</span>
          </span>
          <Avatar className="size-7">
            <AvatarFallback className="bg-primary/15 text-primary-accent text-xs">
              {initialsOf(name)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuLabel className="font-normal">
          <span className="block font-medium text-sm">{name}</span>
          <span className="block text-muted-foreground text-xs">{phone}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            onSelect={() => signOut({ callbackUrl: "/sign-in" })}
          >
            <LogOutIcon className="size-4" />
            <span>{messages["topbar.signOut"]}</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
