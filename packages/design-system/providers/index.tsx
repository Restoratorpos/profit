"use client";

import { ConfirmDialogProvider } from "@repo/design-system/components/composed/confirm-dialog";
import { Toaster } from "@repo/design-system/components/ui/sonner";
import { TooltipProvider } from "@repo/design-system/components/ui/tooltip";
import { ThemeProvider } from "@repo/design-system/providers/theme";
import type { ReactNode } from "react";

interface DesignSystemProviderProps {
  children: ReactNode;
  defaultTheme?: string;
  enableSystem?: boolean;
}

const ALL_THEMES = [
  "light",
  "dark",
  "pure-light",
  "magic-blue",
  "classic-dark",
  "custom",
];

export function DesignSystemProvider({
  children,
  defaultTheme = "dark",
  enableSystem = true,
}: DesignSystemProviderProps) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme={defaultTheme}
      enableColorScheme={false}
      enableSystem={enableSystem}
      storageKey="psy-theme"
      themes={ALL_THEMES}
    >
      <TooltipProvider delayDuration={0}>
        <ConfirmDialogProvider>
          {children}
          <Toaster />
        </ConfirmDialogProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}
