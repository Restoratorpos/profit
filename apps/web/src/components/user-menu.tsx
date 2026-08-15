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
import { Link, useNavigate } from "@tanstack/react-router";
import {
  LogOutIcon,
  ScanFaceIcon,
  SettingsIcon,
  UserRoundIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth/context";
import type { Messages } from "@/lib/i18n/dictionary";

interface UserMenuProperties {
  messages: Messages;
}

export const UserMenu = ({ messages }: UserMenuProperties) => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const name = user?.name ?? "";
  const phone = formatPhone(user?.phone);

  const signOutMutation = useMutation({
    mutationFn: signOut,
    // replace, so Back does not land on a page the guard will bounce them off.
    onSettled: () => navigate({ to: "/sign-in", replace: true }),
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/*
         * A person mark and the name — no initials and no phone number. The
         * initials were a two-letter puzzle for something the name says
         * outright, and the number is an account detail that belongs in the menu
         * and on the settings screen rather than in the header all day.
         */}
        <Button
          aria-label={messages["topbar.account"]}
          className="h-auto gap-2 rounded-full py-0.5 pr-0.5 pl-3 font-normal"
          variant="ghost"
        >
          {/* Name first, mark last — it reads inward from the edge of the
              screen, and it puts the mark against the corner rather than a word
              that changes length with whoever is on shift. Truncates rather
              than wraps: a long name must not push the control off a narrow
              header. */}
          <span className="max-w-[8rem] truncate font-medium text-sm sm:max-w-[12rem]">
            {name}
          </span>
          <Avatar className="size-7 ring-2 ring-primary/25">
            <AvatarFallback className="bg-primary/15 text-primary-accent">
              <UserRoundIcon className="size-3.5" />
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
            <AvatarFallback className="bg-primary/15 text-primary-accent">
              <UserRoundIcon className="size-5" />
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

        {/*
         * Terminals live here rather than in the sidebar: they are configured
         * once when a device is hung on the wall and then never touched, so a
         * permanent slot in a nav the desk reads all day was spending prime
         * space on a yearly errand.
         */}
        <DropdownMenuGroup>
          <DropdownMenuItem asChild className="gap-2">
            <Link to="/devices">
              <ScanFaceIcon className="size-4" />
              <span>{messages["nav.devices"]}</span>
            </Link>
          </DropdownMenuItem>

          {/*
           * Settings sits with the terminals for the same reason: it is where
           * this machine's language and theme live alongside the gym's name and
           * opening hours, all of them set once rather than during a shift.
           */}
          <DropdownMenuItem asChild className="gap-2">
            <Link to="/settings">
              <SettingsIcon className="size-4" />
              <span>{messages["nav.settings"]}</span>
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>

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
