import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleXIcon,
  PackageIcon,
} from "lucide-react";
import type { Messages } from "@/lib/i18n/dictionary";
import type { StockCounts, StockStatus } from "../types";

/**
 * The four counts above the table. They are the question the desk asks before
 * reading a single row — is anything about to run out — so they carry colour and
 * an icon, while the table below stays monochrome.
 *
 * Colour never carries the meaning on its own: each tile is labelled, and the
 * icon differs in shape as well as hue for anyone who cannot tell amber from
 * red on the desk terminal.
 */

interface Tile {
  accent: string;
  icon: typeof PackageIcon;
  key: StockStatus | "total";
  labelKey:
    | "inventory.statTotal"
    | "inventory.statInStock"
    | "inventory.statLow"
    | "inventory.statOut";
  value: string;
}

interface StatTilesProperties {
  counts: StockCounts;
  messages: Messages;
  /** Highlights the tile whose products the table is filtered down to. */
  onSelect: (status: StockStatus | "total") => void;
  selected: StockStatus | "total";
}

export const StatTiles = ({
  counts,
  messages,
  onSelect,
  selected,
}: StatTilesProperties) => {
  const tiles: Tile[] = [
    {
      accent: "text-foreground",
      icon: PackageIcon,
      key: "total",
      labelKey: "inventory.statTotal",
      value: String(counts.total),
    },
    {
      accent: "text-primary-accent",
      icon: CircleCheckIcon,
      key: "in",
      labelKey: "inventory.statInStock",
      value: String(counts.in),
    },
    {
      accent: "text-amber-600 dark:text-amber-400",
      icon: CircleAlertIcon,
      key: "low",
      labelKey: "inventory.statLow",
      value: String(counts.low),
    },
    {
      accent: "text-destructive",
      icon: CircleXIcon,
      key: "out",
      labelKey: "inventory.statOut",
      value: String(counts.out),
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((tile) => {
        const isSelected = selected === tile.key;

        return (
          // A tile is a filter, so it is a button — not a card with a click
          // handler bolted on that the keyboard can never reach.
          <Button
            aria-pressed={isSelected}
            className={cn(
              "h-auto flex-1 items-center justify-start gap-3 rounded-xl p-4 text-left",
              isSelected && "border-primary bg-muted/50"
            )}
            key={tile.key}
            onClick={() => onSelect(tile.key)}
            type="button"
            variant="outline"
          >
            <span
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-full bg-muted",
                tile.accent
              )}
            >
              <tile.icon className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-muted-foreground text-xs uppercase tracking-wide">
                {messages[tile.labelKey]}
              </span>
              <span
                className={cn(
                  "block font-semibold text-2xl tabular-nums",
                  tile.accent
                )}
              >
                {tile.value}
              </span>
            </span>
          </Button>
        );
      })}
    </div>
  );
};
