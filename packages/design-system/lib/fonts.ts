import { cn } from "@repo/design-system/lib/utils";

/**
 * Applied to <html> by every app's root layout.
 *
 * styles/globals.css already resolves --font-sans to a system stack, so there
 * is no webfont to load here — this only carries the classes the document
 * element needs.
 */
export const fonts = cn("touch-manipulation font-sans antialiased");
