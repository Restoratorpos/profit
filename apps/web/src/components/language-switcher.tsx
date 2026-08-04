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
import { LOCALES, type Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/dictionary";
import { useLocale } from "@/lib/i18n/provider";

interface LanguageSwitcherProperties {
  locale: Locale;
  messages: Messages;
}

export const LanguageSwitcher = ({
  locale,
  messages,
}: LanguageSwitcherProperties) => {
  /*
   * The Next version wrote the cookie and called router.refresh(), because the
   * strings were resolved on the server. Here the dictionary is already in the
   * bundle, so setting state re-renders the tree immediately and the cookie is
   * only how the choice survives a reload.
   */
  const { setLocale } = useLocale();

  const active = LOCALES.find((entry) => entry.code === locale) ?? LOCALES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={messages["settings.language"]}
          className="h-8 gap-1 px-2 font-normal"
          size="sm"
          variant="ghost"
        >
          <span>{active.short}</span>
          <ChevronDownIcon className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuLabel>{messages["settings.language"]}</DropdownMenuLabel>
        <DropdownMenuGroup>
          {LOCALES.map((entry) => (
            <DropdownMenuItem
              key={entry.code}
              onSelect={() => setLocale(entry.code)}
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
