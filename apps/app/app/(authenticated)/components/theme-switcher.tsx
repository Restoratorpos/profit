"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import type { Messages } from "@/lib/i18n/dictionary";

interface ThemeSwitcherProperties {
  messages: Messages;
}

const OPTIONS = [
  { icon: SunIcon, value: "light" },
  { icon: MoonIcon, value: "dark" },
] as const;

/**
 * One toggle wearing two icons.
 *
 * It looks segmented so the theme you are in is readable at a glance from the
 * filled chip, rather than inferred from an icon that means "the other one" — but
 * it is a single button, so a click anywhere on it switches. Two buttons that
 * each *set* a theme read as broken: half of every press lands on the side
 * that is already active and nothing happens.
 */
export const ThemeSwitcher = ({ messages }: ThemeSwitcherProperties) => {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // The server cannot know the stored theme, so the active state is only
  // trustworthy after mount. Rendering it before then is a hydration mismatch.
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";
  // The label names where the press takes you, which is what a screen reader
  // needs from a button — the chips carry where you already are.
  const nextLabel = isDark
    ? messages["topbar.theme.light"]
    : messages["topbar.theme.dark"];

  return (
    <Button
      aria-label={nextLabel}
      className="h-auto gap-0.5 rounded-full bg-muted p-0.5 hover:bg-muted"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      title={nextLabel}
      type="button"
      variant="ghost"
    >
      {OPTIONS.map((option) => {
        const isActive = mounted && resolvedTheme === option.value;

        return (
          <span
            className={cn(
              "flex size-7 items-center justify-center rounded-full transition-colors",
              isActive
                ? "bg-background text-primary-accent shadow-sm"
                : "text-muted-foreground"
            )}
            key={option.value}
          >
            <option.icon className="size-4" />
          </span>
        );
      })}
    </Button>
  );
};
