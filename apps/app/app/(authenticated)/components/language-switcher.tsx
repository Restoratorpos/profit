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
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { setDeviceCookie } from "@/lib/cookies";
import { LOCALE_COOKIE, LOCALES, type Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/dictionary";

interface LanguageSwitcherProperties {
  locale: Locale;
  messages: Messages;
}

export const LanguageSwitcher = ({
  locale,
  messages,
}: LanguageSwitcherProperties) => {
  const router = useRouter();

  const active = LOCALES.find((entry) => entry.code === locale) ?? LOCALES[0];

  const handleSelect = (code: Locale) => {
    setDeviceCookie(LOCALE_COOKIE, code);
    // The strings are resolved on the server, so ask it to render again rather
    // than duplicating the dictionary on the client.
    router.refresh();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={messages["topbar.language"]}
          className="h-8 gap-1 px-2 font-normal"
          size="sm"
          variant="ghost"
        >
          <span>{active.short}</span>
          <ChevronDownIcon className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuLabel>{messages["topbar.language"]}</DropdownMenuLabel>
        <DropdownMenuGroup>
          {LOCALES.map((entry) => (
            <DropdownMenuItem
              key={entry.code}
              onSelect={() => handleSelect(entry.code)}
            >
              <span className="w-7 text-muted-foreground text-xs">
                {entry.short}
              </span>
              <span className="flex-1">{entry.label}</span>
              {entry.code === active.code ? (
                <CheckIcon className="size-4 text-primary-accent" />
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
