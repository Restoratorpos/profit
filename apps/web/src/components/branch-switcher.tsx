import { Button } from "@repo/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import { cn } from "@repo/design-system/lib/utils";
import { CheckIcon, ChevronsUpDownIcon, StoreIcon } from "lucide-react";
import { useState } from "react";
import { BRANCH_COOKIE, type BranchOption } from "@/lib/branches";
import { setDeviceCookie } from "@/lib/device-prefs";
import type { Messages } from "@/lib/i18n/dictionary";

interface BranchSwitcherProperties {
  activeBranchId: string;
  branches: readonly BranchOption[];
  messages: Messages;
}

/**
 * The selection is device-scoped, like the sidebar and locale: a POS terminal
 * sits in one branch, so the machine should remember it rather than making
 * whoever is on shift pick it again.
 */
export const BranchSwitcher = ({
  activeBranchId,
  branches,
  messages,
}: BranchSwitcherProperties) => {
  const [selectedId, setSelectedId] = useState(activeBranchId);

  const active =
    branches.find((branch) => branch.id === selectedId) ?? branches[0];

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setDeviceCookie(BRANCH_COOKIE, id);
    /*
     * No router.refresh() here: nothing is rendered on a server any more. Once
     * the feature routes land this also needs to invalidate the react-query
     * cache, since every list is scoped to the branch.
     */
  };

  if (!active) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/*
         * Two lines rather than one: which branch a terminal is pointed at
         * decides what every list on the screen contains, so it is worth the
         * row. The label above the name is what makes it a statement of where
         * you are rather than an unexplained word in the header.
         */}
        <Button
          className="h-auto max-w-full gap-2 px-2 py-1.5 font-normal"
          variant="ghost"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary-accent">
            <StoreIcon className="size-4" />
          </span>
          <span className="flex min-w-0 flex-col items-start leading-tight">
            <span className="text-[0.6875rem] text-muted-foreground uppercase tracking-wide">
              {messages["topbar.branch"]}
            </span>
            <span className="max-w-[9rem] truncate font-medium text-sm sm:max-w-[14rem]">
              {active.name}
            </span>
          </span>
          <ChevronsUpDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-muted-foreground text-xs uppercase tracking-wide">
          {messages["topbar.branch"]}
        </DropdownMenuLabel>
        <DropdownMenuGroup>
          {branches.map((branch) => {
            const isCurrent = branch.id === active.id;

            return (
              <DropdownMenuItem
                className="gap-2 py-2"
                key={branch.id}
                onSelect={() => handleSelect(branch.id)}
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
