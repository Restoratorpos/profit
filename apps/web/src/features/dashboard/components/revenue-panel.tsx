import { Button } from "@repo/design-system/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/design-system/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/design-system/components/ui/table";
import { SELECTED_TINT } from "@repo/design-system/lib/selected";
import { cn } from "@repo/design-system/lib/utils";
import { BarChart3Icon, ChartColumnIcon, TableIcon } from "lucide-react";
import { useState } from "react";
import type { Messages } from "@/lib/i18n/dictionary";
import {
  formatAmount,
  formatDayFull,
  pointTotal,
  RANGE_LABEL,
  REVENUE_RANGES,
  REVENUE_SOURCES,
  type RevenuePoint,
  type RevenueRange,
  SOURCE_COLOR,
  SOURCE_LABEL,
} from "../types";
import { RevenueChart } from "./revenue-chart";

/**
 * The chart, its legend, and the table that is its equal.
 *
 * The table is not a fallback nobody opens. Three of the five series colours sit
 * below 3:1 against a white card — legible as a mark, not as text — and the rule
 * for that is that the reader gets a second, contrast-clean way to reach every
 * number. This is it, which is also why the toggle is a visible control rather
 * than something behind a menu.
 */

interface RevenuePanelProperties {
  isStale: boolean;
  messages: Messages;
  onRangeChange: (next: RevenueRange) => void;
  points: RevenuePoint[];
  range: RevenueRange;
}

type Mode = "chart" | "table";

const Legend = ({ messages }: { messages: Messages }) => (
  <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
    {REVENUE_SOURCES.map((source) => (
      <li className="flex items-center gap-2 text-caption" key={source}>
        {/* A legend mirrors the mark: these are filled columns, so the key is a
            filled swatch. Tooltip rows use a stroke instead. */}
        <span
          className="size-3 shrink-0 rounded-[3px]"
          style={{ backgroundColor: SOURCE_COLOR[source] }}
        />
        <span className="text-muted-foreground">
          {messages[SOURCE_LABEL[source]]}
        </span>
      </li>
    ))}
  </ul>
);

export const RevenuePanel = ({
  isStale,
  messages,
  onRangeChange,
  points,
  range,
}: RevenuePanelProperties) => {
  const [mode, setMode] = useState<Mode>("chart");

  const hasMoney = points.some((point) => pointTotal(point) > 0);

  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-medium text-body">
            {messages["dash.chartTitle"]}
          </h2>
          <p className="text-caption text-muted-foreground">
            {messages["dash.chartSubtitle"]}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* One filter row, scoping everything in this section — the tiles
              above the chart read the same window. */}
          <div className="flex items-center gap-1">
            {REVENUE_RANGES.map((days) => (
              <Button
                aria-pressed={days === range}
                className={cn(days === range && SELECTED_TINT)}
                key={days}
                onClick={() => onRangeChange(days)}
                size="sm"
                type="button"
                variant="outline"
              >
                {messages[RANGE_LABEL[days]]}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <Button
              aria-label={messages["dash.viewChart"]}
              aria-pressed={mode === "chart"}
              className={cn(mode === "chart" && SELECTED_TINT)}
              onClick={() => setMode("chart")}
              size="icon-sm"
              type="button"
              variant="outline"
            >
              <ChartColumnIcon />
            </Button>
            <Button
              aria-label={messages["dash.viewTable"]}
              aria-pressed={mode === "table"}
              className={cn(mode === "table" && SELECTED_TINT)}
              onClick={() => setMode("table")}
              size="icon-sm"
              type="button"
              variant="outline"
            >
              <TableIcon />
            </Button>
          </div>
        </div>
      </header>

      {hasMoney ? <Legend messages={messages} /> : null}

      {hasMoney ? null : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BarChart3Icon />
            </EmptyMedia>
            <EmptyTitle>{messages["dash.chartEmpty"]}</EmptyTitle>
            <EmptyDescription>
              {messages["dash.chartEmptyHint"]}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {hasMoney && mode === "chart" ? (
        <RevenueChart isStale={isStale} messages={messages} points={points} />
      ) : null}

      {hasMoney && mode === "table" ? (
        <div
          className={cn(
            "max-h-80 overflow-auto transition-opacity",
            isStale && "opacity-60"
          )}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{messages["dash.colDay"]}</TableHead>
                {REVENUE_SOURCES.map((source) => (
                  <TableHead className="text-right" key={source}>
                    {messages[SOURCE_LABEL[source]]}
                  </TableHead>
                ))}
                <TableHead className="text-right">
                  {messages["dash.colTotal"]}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Newest first — the table is read, not scrubbed, and the day the
                  desk cares about is the one that just finished. Reversed in
                  place, which mutates nothing: the filter above already handed
                  back a fresh array. (`toReversed` would read better but this
                  app's TS lib target predates it.) */}
              {points
                .filter((point) => pointTotal(point) > 0)
                .reverse()
                .map((point) => (
                  <TableRow key={point.date}>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {formatDayFull(point.date)}
                    </TableCell>
                    {REVENUE_SOURCES.map((source) => (
                      <TableCell
                        className="text-right tabular-nums"
                        key={source}
                      >
                        {formatAmount(point[source])}
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatAmount(pointTotal(point))}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </section>
  );
};
