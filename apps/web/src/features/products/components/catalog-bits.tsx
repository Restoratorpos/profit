import { Badge } from "@repo/design-system/components/ui/badge";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/design-system/components/ui/empty";
import { cn } from "@repo/design-system/lib/utils";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The small shared pieces every catalog table repeats: the tile colour, the
 * margin read-out and the summary strip above the table. They live together
 * because they only make sense next to each other — three tables rendering a
 * margin three slightly different ways is exactly the inconsistency the redesign
 * was meant to remove.
 */

/**
 * The product's POS tile colour, shown beside its name so the table and the till
 * are recognisably the same catalog.
 *
 * A rounded square rather than a dot, and big enough to read at arm's length:
 * it is a miniature of the tile the operator taps, and a 12px dot was a legend
 * entry for a colour rather than the colour itself.
 *
 * A product with no colour gets a hollow outline rather than a filled grey
 * square — "no colour chosen" and "grey chosen" must not look identical.
 */
export const ColorSwatch = ({ color }: { color: string | null }) => (
  <span
    aria-hidden="true"
    className={cn(
      // Kept in step with the header indent in products-table — the "Nomi"
      // label is padded to clear exactly this square plus its gap.
      "inline-block size-6 shrink-0 rounded-lg",
      color
        ? "ring-1 ring-black/10"
        : "border-2 border-muted-foreground/30 border-dashed"
    )}
    style={color ? { backgroundColor: color } : undefined}
  />
);

/**
 * Margin as a percentage. Colour alone never carries the meaning — the sign is
 * in the text — because a red/green distinction is invisible to part of the
 * room and to anyone on the washed-out desk monitor.
 */
export const MarginBadge = ({ percent }: { percent: number | null }) => {
  if (percent === null) {
    return <span className="text-muted-foreground">—</span>;
  }

  const rounded = Math.round(percent);

  return (
    <Badge
      className={cn(
        "tabular-nums",
        rounded < 0 && "border-destructive/40 text-destructive"
      )}
      variant="outline"
    >
      {rounded > 0 ? "+" : ""}
      {rounded}%
    </Badge>
  );
};

/**
 * The state a tab is in when it has nothing to show. It replaces the table
 * rather than sitting in a colspan cell, so an empty tab can explain what the
 * thing actually is and offer the button that creates one — which matters most
 * for ingredients, the one concept here nobody arrives already knowing.
 */
export const CatalogEmpty = ({
  action,
  description,
  icon: Icon,
  title,
}: {
  action?: ReactNode;
  description: string;
  icon: LucideIcon;
  title: string;
}) => (
  <Empty className="border py-16">
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <Icon />
      </EmptyMedia>
      <EmptyTitle className="text-base">{title}</EmptyTitle>
      <EmptyDescription>{description}</EmptyDescription>
    </EmptyHeader>
    {action ? <EmptyContent>{action}</EmptyContent> : null}
  </Empty>
);

export interface CatalogStat {
  /** Rendered muted when there is nothing to report, loud when there is. */
  isAlert?: boolean;
  label: string;
  value: string;
}

/**
 * A one-line summary above the table. It answers the questions the desk asks
 * before it starts reading rows — how many, are we making money, what is
 * unfinished — so a missing cost is visible without scanning every line.
 */
export const CatalogStats = ({ stats }: { stats: readonly CatalogStat[] }) => (
  // No box of its own. These are a caption for the table below, not a panel:
  // given a background and a full row they read as a fourth thing to deal with
  // above a list that might hold one product.
  <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 px-2 text-sm sm:px-4">
    {stats.map((stat) => (
      <div className="flex items-baseline gap-1.5" key={stat.label}>
        <dt className="text-muted-foreground">{stat.label}</dt>
        <dd
          className={cn(
            "font-semibold tabular-nums",
            stat.isAlert && "text-destructive"
          )}
        >
          {stat.value}
        </dd>
      </div>
    ))}
  </dl>
);
