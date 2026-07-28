import type { ComponentProps } from "react";
import { cn } from "../lib/utils";

/**
 * ProFit brand assets.
 *
 * The mark is three ascending bars in a rounded tile: the "profit" read (a
 * rising trend) and the "fit" read (a rack of weights) are the same shape, which
 * is the whole point of the name. It is drawn on a 32×32 grid with stadium ends
 * so it stays legible down to a 16px favicon — no hairlines, no detail that
 * disappears when it is rasterised.
 *
 * The tile is painted with `currentColor`, so the mark follows whatever colour
 * the call site sets (`text-primary` in the app chrome). The bars are cut from
 * `--primary-foreground` rather than a hardcoded white so they stay legible in
 * every theme; pass `barClassName` when the mark sits on an unusual surface.
 */
export const LogoMark = ({
  className,
  ...properties
}: ComponentProps<"svg">) => (
  <svg
    aria-hidden="true"
    className={cn("size-8 text-primary", className)}
    fill="none"
    focusable="false"
    viewBox="0 0 32 32"
    xmlns="http://www.w3.org/2000/svg"
    {...properties}
  >
    <rect fill="currentColor" height="32" rx="9" width="32" />
    <g fill="var(--color-primary-foreground, #ffffff)">
      <rect height="7" rx="2.5" width="5" x="7" y="19" />
      <rect height="12" rx="2.5" width="5" x="13.5" y="14" />
      <rect height="19" rx="2.5" width="5" x="20" y="7" />
    </g>
  </svg>
);

/**
 * "ProFit" set as two words in one: `Pro` takes the surrounding text colour,
 * `Fit` is always the brand green — the darker `--primary-accent`, not the neon
 * fill, because this is text on the page background. Rendered as text rather
 * than a path so it inherits the type scale and stays selectable.
 */
export const LogoWordmark = ({
  accentClassName,
  className,
  ...properties
}: ComponentProps<"span"> & { accentClassName?: string }) => (
  <span
    className={cn("font-semibold tracking-tight", className)}
    {...properties}
  >
    Pro<span className={cn("text-primary-accent", accentClassName)}>Fit</span>
  </span>
);

interface LogoProperties {
  readonly accentClassName?: string;
  readonly className?: string;
  readonly markClassName?: string;
  /** Hide the wordmark and show the mark alone (collapsed rails, avatars). */
  readonly markOnly?: boolean;
  readonly wordmarkClassName?: string;
}

export const Logo = ({
  markOnly = false,
  className,
  markClassName,
  wordmarkClassName,
  accentClassName,
}: LogoProperties) => (
  <span className={cn("flex items-center gap-2.5", className)}>
    <LogoMark className={markClassName} />
    {markOnly ? (
      <span className="sr-only">ProFit</span>
    ) : (
      <LogoWordmark
        accentClassName={accentClassName}
        className={wordmarkClassName}
      />
    )}
  </span>
);
