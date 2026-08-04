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
import { Skeleton } from "@repo/design-system/components/ui/skeleton";
import { cn } from "@repo/design-system/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CheckIcon, SettingsIcon, StoreIcon } from "lucide-react";
import { useState } from "react";
import { gymSettingsQuery } from "@/features/settings";
import { useAuth } from "@/lib/auth/context";
import { BRANCH_COOKIE } from "@/lib/branches";
import { readDeviceCookie, setDeviceCookie } from "@/lib/device-prefs";
import type { Messages } from "@/lib/i18n/dictionary";

interface GymBadgeProperties {
  messages: Messages;
}

/** Who may point the terminal at a different branch. */
const CAN_SWITCH_BRANCH = new Set(["owner", "admin"]);

/**
 * Which gym this terminal is signed in to — a mark and the name.
 *
 * It replaced a branch switcher that said "FILIAL" over a hard-coded "Main":
 * the label explained a word nobody had asked about, and the switcher offered a
 * choice of one from a placeholder list with no branches behind it. The gym's
 * own name is what is actually true here, and the branches under it are now
 * read from the API rather than invented.
 */
export const GymBadge = ({ messages }: GymBadgeProperties) => {
  const { data } = useQuery(gymSettingsQuery);
  const { user } = useAuth();

  /*
   * Null until something says otherwise, resolved against the fetched list on
   * render. Reading the cookie once is enough — it cannot change under us
   * without a reload, and the branch it names may not even belong to this gym
   * if the terminal was signed into another one before.
   */
  const [chosenId, setChosenId] = useState(() =>
    readDeviceCookie(BRANCH_COOKIE)
  );

  const branches = data?.branches ?? [];
  const active =
    branches.find((branch) => branch.id === chosenId) ??
    branches.find((branch) => branch.id === data?.branchId) ??
    branches[0];

  const canSwitch = CAN_SWITCH_BRANCH.has(user?.role ?? "");

  const label = data ? (
    <span className="max-w-[10rem] truncate font-medium text-sm sm:max-w-[18rem]">
      {data.name}
    </span>
  ) : (
    /* A skeleton rather than a blank while the row loads: the name is the
       widest thing in the header, and letting it appear from nothing shifts
       everything beside it on a screen the operator is already reading. */
    <Skeleton className="h-4 w-28" />
  );

  const mark = (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary-accent">
      <StoreIcon className="size-3.5" />
    </span>
  );

  /*
   * Anyone who cannot switch gets a plain link to the settings screen. A
   * dropdown holding one disabled section and a link is a press for nothing.
   */
  if (!canSwitch) {
    return (
      <Button
        aria-label={messages["nav.settings"]}
        asChild
        className="h-auto max-w-full gap-2 px-2 py-1 font-normal"
        variant="ghost"
      >
        <Link to="/settings">
          {mark}
          {label}
        </Link>
      </Button>
    );
  }

  const chooseBranch = (id: string) => {
    setChosenId(id);
    setDeviceCookie(BRANCH_COOKIE, id);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="h-auto max-w-full gap-2 px-2 py-1 font-normal"
          variant="ghost"
        >
          {mark}
          {label}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-muted-foreground text-xs uppercase tracking-wide">
          {messages["topbar.branch"]}
        </DropdownMenuLabel>
        <DropdownMenuGroup>
          {branches.map((branch) => {
            const isCurrent = branch.id === active?.id;

            return (
              <DropdownMenuItem
                className="gap-2 py-2"
                key={branch.id}
                onSelect={() => chooseBranch(branch.id)}
              >
                {/*
                 * The tile carries the state, not the row background: Radix
                 * already owns the row's background for keyboard highlight, and
                 * a second background there would make "hovered" and "current"
                 * the same picture.
                 */}
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-md",
                    isCurrent
                      ? "bg-selected text-selected-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  <StoreIcon className="size-3.5" />
                </span>
                <span
                  className={cn("flex-1 truncate", isCurrent && "font-medium")}
                >
                  {branch.name}
                </span>
                {isCurrent ? (
                  <CheckIcon className="size-4 shrink-0 text-primary-accent" />
                ) : null}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild className="gap-2">
          <Link to="/settings">
            <SettingsIcon className="size-4" />
            <span>{messages["nav.settings"]}</span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
