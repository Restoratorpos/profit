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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import { Spinner } from "@repo/design-system/components/ui/spinner";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { LogOutIcon } from "lucide-react";
import { useAuth } from "@/lib/auth/context";
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
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const name = user?.name ?? "";
  const phone = formatPhone(user?.phone);
  const initials = initialsOf(name);

  const signOutMutation = useMutation({
    mutationFn: signOut,
    // replace, so Back does not land on a page the guard will bounce them off.
    onSettled: () => navigate({ to: "/sign-in", replace: true }),
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/*
         * On a phone the name and number drop away and the avatar is the whole
         * control — they are repeated at the top of the menu, so nothing is
         * lost by not spending a third of a 320px header on them.
         */}
        <Button
          aria-label={messages["topbar.account"]}
          className="h-auto gap-2 rounded-full py-1 pr-1 pl-2 font-normal sm:pl-3"
          variant="ghost"
        >
          <span className="hidden text-right leading-tight sm:block">
            <span className="block font-medium text-sm">{name}</span>
            <span className="block text-muted-foreground text-xs">{phone}</span>
          </span>
          <Avatar className="size-8 ring-2 ring-primary/25">
            <AvatarFallback className="bg-primary/15 font-semibold text-primary-accent text-xs">
              {initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        {/*
         * A plain block, not a DropdownMenuLabel wrapping an avatar: the label
         * is a one-line slot and the identity here is a small card.
         */}
        <div className="flex items-center gap-3 p-2">
          <Avatar className="size-10">
            <AvatarFallback className="bg-primary/15 font-semibold text-primary-accent text-sm">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate font-medium text-sm">{name}</span>
            <span className="truncate text-muted-foreground text-xs">
              {phone}
            </span>
          </div>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          {/*
           * Signing out is the destructive item in this menu, so it says so on
           * hover. It stays mounted and merely disabled while in flight — with
           * a spinner in place of the icon, so the row does not change width.
           */}
          <DropdownMenuItem
            className="gap-2 text-destructive focus:bg-destructive/10 focus:text-destructive"
            disabled={signOutMutation.isPending}
            onSelect={(event) => {
              // Radix closes the menu on select; keeping it open is what lets
              // the pending state be visible at all.
              event.preventDefault();
              signOutMutation.mutate();
            }}
          >
            {signOutMutation.isPending ? (
              <Spinner className="size-4" />
            ) : (
              <LogOutIcon className="size-4" />
            )}
            <span>{messages["topbar.signOut"]}</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
