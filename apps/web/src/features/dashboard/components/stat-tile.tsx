import { cn } from "@repo/design-system/lib/utils";
import {
  type LucideIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from "lucide-react";
import type { ReactNode } from "react";

/**
 * One figure, said once.
 *
 * The same tile language the cashbox and stock screens use — icon in a muted
 * circle, small uppercase label, one large figure — so the three screens read as
 * one product rather than three dashboards that happen to share a sidebar.
 *
 * The figure deliberately does **not** wear `tabular-nums`. Equal-width digits
 * are for columns that have to line up; at tile size they make a number like
 * "121" look loose and hand-set. Tables on this screen do use them.
 */

interface StatTileProperties {
  /** Rendered under the value — a breakdown, a second figure, a link. */
  children?: ReactNode;
  /**
   * Percent change against the window before. Null means there was nothing to
   * compare against, and the tile then shows no delta at all rather than a
   * fabricated +100%.
   */
  delta?: number | null;
  /** What the delta is measured against, e.g. "vs oldingi 30 kun". */
  deltaLabel?: string;
  /** The one figure this dashboard leads with. Exactly one tile may set it. */
  hero?: boolean;
  icon?: LucideIcon;
  label: string;
  /**
   * Whether a rise is good news. False on spending: the same green arrow on a
   * growing expense would congratulate the operator for losing money.
   */
  upIsGood?: boolean;
  value: string;
}

const Delta = ({
  delta,
  label,
  upIsGood,
}: {
  delta: number;
  label?: string;
  upIsGood: boolean;
}) => {
  const isUp = delta > 0;
  const isFlat = delta === 0;
  const isGood = isUp === upIsGood;
  const Icon = isUp ? TrendingUpIcon : TrendingDownIcon;

  return (
    <span
      className={cn(
        "flex items-center gap-1 text-caption",
        isFlat && "text-muted-foreground",
        !isFlat && (isGood ? "text-primary-accent" : "text-destructive")
      )}
    >
      {/* The arrow, the sign and the words all say the same thing. Colour on its
          own is not a channel everybody has. */}
      {isFlat ? null : <Icon aria-hidden="true" className="size-4" />}
      <span className="font-medium tabular-nums">
        {isUp ? "+" : ""}
        {delta}%
      </span>
      {label ? (
        <span className="truncate text-muted-foreground">{label}</span>
      ) : null}
    </span>
  );
};

export const StatTile = ({
  children,
  delta,
  deltaLabel,
  hero = false,
  icon: Icon,
  label,
  upIsGood = true,
  value,
}: StatTileProperties) => (
  <div className="flex min-w-0 flex-col justify-between gap-3 rounded-xl border border-border bg-card p-4">
    <div className="flex min-w-0 items-center gap-3">
      {Icon ? (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="size-5" />
        </span>
      ) : null}
      <span className="min-w-0 truncate text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </span>
    </div>

    <div className="flex min-w-0 flex-col gap-1">
      <span
        className={cn(
          "block truncate font-semibold",
          hero ? "text-4xl sm:text-5xl" : "text-2xl"
        )}
      >
        {value}
      </span>

      {typeof delta === "number" ? (
        <Delta delta={delta} label={deltaLabel} upIsGood={upIsGood} />
      ) : null}

      {children}
    </div>
  </div>
);
