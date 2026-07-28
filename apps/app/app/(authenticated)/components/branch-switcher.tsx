"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BRANCH_COOKIE, type BranchOption } from "@/lib/branches";
import { setDeviceCookie } from "@/lib/cookies";
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
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(activeBranchId);

  const active =
    branches.find((branch) => branch.id === selectedId) ?? branches[0];

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setDeviceCookie(BRANCH_COOKIE, id);
    // Server components read the cookie, so re-render them rather than holding
    // two copies of "which branch am I in".
    router.refresh();
  };

  if (!active) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="h-8 gap-1.5 px-2 font-normal"
          size="sm"
          variant="ghost"
        >
          <span className="max-w-[10rem] truncate">{active.name}</span>
          <ChevronsUpDownIcon className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-52">
        <DropdownMenuLabel>{messages["topbar.branch"]}</DropdownMenuLabel>
        <DropdownMenuGroup>
          {branches.map((branch) => (
            <DropdownMenuItem
              key={branch.id}
              onSelect={() => handleSelect(branch.id)}
            >
              <span className="flex-1 truncate">{branch.name}</span>
              {branch.id === active.id ? (
                <CheckIcon className="size-4 text-primary-accent" />
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
