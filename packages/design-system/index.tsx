import type { ThemeProviderProps } from "next-themes";
import { Toaster } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { ThemeProvider } from "./providers/theme";

type DesignSystemProviderProperties = ThemeProviderProps;

export const DesignSystemProvider = ({
  children,
  ...properties
}: DesignSystemProviderProperties) => (
  <ThemeProvider
    // styles/globals.css keys dark mode off a class (`.dark`, via
    // @custom-variant), but next-themes defaults to attribute="data-theme".
    // Without this the toggle sets an attribute nothing styles, and picking
    // "Dark" silently does nothing.
    attribute="class"
    defaultTheme="system"
    disableTransitionOnChange
    enableSystem
    {...properties}
  >
    <TooltipProvider>{children}</TooltipProvider>
    <Toaster />
  </ThemeProvider>
);
