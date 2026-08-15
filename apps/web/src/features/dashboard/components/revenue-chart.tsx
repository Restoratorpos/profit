import { cn } from "@repo/design-system/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Messages } from "@/lib/i18n/dictionary";
import {
  formatAmount,
  formatCompact,
  formatDayFull,
  formatDayTick,
  pointTotal,
  REVENUE_SOURCES,
  type RevenuePoint,
  SOURCE_COLOR,
  SOURCE_LABEL,
} from "../types";

/**
 * Takings per day, stacked by where they came from.
 *
 * Hand-drawn SVG rather than a charting library: this is one chart, the repo has
 * no charting dependency, and every library worth using would arrive with its
 * own colour opinions to be overridden anyway. The specs below — 24px cap on the
 * bar, 2px of surface between stacked segments, a 4px round on the data end and
 * a square foot on the baseline, hairline solid gridlines — are what make it
 * look considered rather than default.
 *
 * **Colour is assigned by source, never by size.** `REVENUE_SOURCES` fixes the
 * order and each source takes the matching `--chart-N` slot, so a quiet month
 * for the bar does not repaint memberships.
 */

const PAD_LEFT = 56;
const PAD_RIGHT = 8;
const PAD_TOP = 20;
const PLOT_HEIGHT = 220;
const AXIS_BAND = 26;
const SVG_HEIGHT = PAD_TOP + PLOT_HEIGHT + AXIS_BAND;

/** White doing the separating. One width, everywhere marks touch. */
const GAP = 2;

/** Never fill the slot — the leftover is the air between columns. */
const MAX_BAR = 24;
const MIN_BAR = 3;
const RADIUS = 4;

const Y_STEPS = 4;
/** Roughly how many dates fit under the plot before they collide. */
const X_TICKS = 6;

/** Width to render at before the container has been measured. */
const FALLBACK_WIDTH = 720;

/**
 * The axis top, rounded up to a number a person would choose.
 *
 * An axis topping out at "1,437,219" is arithmetic showing its working; the
 * ticks exist to be read at a glance, and the values they cannot carry are in
 * the tooltip and the table.
 */
const niceCeiling = (value: number, steps = Y_STEPS): number => {
  if (value <= 0) {
    return 0;
  }

  const rough = value / steps;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step =
    magnitude * ([1, 2, 2.5, 5, 10].find((c) => rough <= c * magnitude) ?? 10);

  return step * steps;
};

/** A rect with its data end rounded and its foot square on the baseline. */
const cappedBar = (x: number, y: number, w: number, h: number): string => {
  const r = Math.min(RADIUS, w / 2, h);

  return [
    `M ${x} ${y + h}`,
    `L ${x} ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    `L ${x + w - r} ${y}`,
    `Q ${x + w} ${y} ${x + w} ${y + r}`,
    `L ${x + w} ${y + h}`,
    "Z",
  ].join(" ");
};

/**
 * The container's width in CSS pixels.
 *
 * Measured rather than handed to a `viewBox`, because a scaled `viewBox` scales
 * the type with it — a 90-day chart would render its axis labels at half the
 * size of a 7-day one. `ResizeObserver` is absent in jsdom, so the fallback is
 * not defensive dressing: it is what makes the chart renderable in a test.
 */
const useMeasuredWidth = (): [
  React.RefObject<HTMLDivElement | null>,
  number,
] => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(FALLBACK_WIDTH);

  useEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    const measure = () => {
      const measured = element.getBoundingClientRect().width;

      if (measured > 0) {
        setWidth(measured);
      }
    };

    measure();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(measure);

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return [ref, width];
};

interface RevenueChartProperties {
  /** Held true while a new window loads, so the frame never empties. */
  isStale: boolean;
  messages: Messages;
  points: RevenuePoint[];
}

export const RevenueChart = ({
  isStale,
  messages,
  points,
}: RevenueChartProperties) => {
  const [ref, width] = useMeasuredWidth();
  const [active, setActive] = useState<number | null>(null);

  const count = points.length;
  const plotWidth = Math.max(width - PAD_LEFT - PAD_RIGHT, 80);
  const band = plotWidth / Math.max(count, 1);
  const barWidth = Math.min(MAX_BAR, Math.max(MIN_BAR, band - 6));

  let peak = 0;
  let peakIndex = 0;

  for (let index = 0; index < count; index += 1) {
    const total = pointTotal(points[index]);

    if (total > peak) {
      peak = total;
      peakIndex = index;
    }
  }

  const ceiling = niceCeiling(peak);
  const toY = (value: number): number =>
    PAD_TOP +
    PLOT_HEIGHT -
    (ceiling === 0 ? 0 : (value / ceiling) * PLOT_HEIGHT);

  const centreOf = (index: number): number => PAD_LEFT + band * (index + 0.5);

  /*
   * One overlay for the whole plot rather than a hit area per column. At 90
   * days a column is under 8px wide, and a target that small is one nobody
   * lands on — this way the pointer only has to be *nearest*.
   */
  const handlePointer = useCallback(
    (event: React.PointerEvent<SVGRectElement>) => {
      const box = event.currentTarget.getBoundingClientRect();
      const offset = event.clientX - box.left;
      const index = Math.floor(offset / band);

      setActive(Math.min(Math.max(index, 0), count - 1));
    },
    [band, count]
  );

  const handleKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = (delta: number) => {
      event.preventDefault();
      setActive((current) => {
        const next = (current ?? (delta > 0 ? -1 : count)) + delta;

        return Math.min(Math.max(next, 0), count - 1);
      });
    };

    if (event.key === "ArrowRight") {
      step(1);
    } else if (event.key === "ArrowLeft") {
      step(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(count - 1);
    } else if (event.key === "Escape") {
      setActive(null);
    }
  };

  const activePoint = active === null ? null : points[active];

  /** Evenly spaced dates, always including the first and the last. */
  const tickEvery = Math.max(1, Math.ceil(count / X_TICKS));

  /*
   * The three suppressions below are one decision: this wrapper is a widget, not
   * a container. Arrow keys step the readout, which is what hovering gives a
   * pointer, and that needs a focusable element with key handlers on it. They are
   * single-line comments because a suppression only binds to the token that
   * follows it — wrapping the reason onto a second line puts a plain comment in
   * between and the suppression stops applying to anything.
   */
  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: the chart is a deliberate keyboard and pointer target
    // biome-ignore lint/a11y/noStaticElementInteractions: the readout below is the accessible equivalent of the hover
    <div
      className={cn(
        "relative transition-opacity",
        // Refetch holds the frame: the old chart dims rather than collapsing to
        // a spinner and jumping the page by its own height.
        isStale && "opacity-60"
      )}
      onBlur={() => setActive(null)}
      onKeyDown={handleKey}
      ref={ref}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: arrow keys step the readout, so the chart has to be focusable
      tabIndex={0}
    >
      <svg
        aria-label={messages["dash.chartTitle"]}
        className="block w-full outline-none"
        height={SVG_HEIGHT}
        role="img"
        width={width}
      >
        <title>{messages["dash.chartTitle"]}</title>

        {/* Gridlines and their ticks. Solid hairlines one step off the surface —
            dashes read as a threshold when this is only a grid. */}
        {Array.from({ length: Y_STEPS + 1 }, (_, step) => {
          const value = (ceiling / Y_STEPS) * step;
          const y = toY(value);

          return (
            <g key={value}>
              <line
                className="text-border"
                shapeRendering="crispEdges"
                stroke="currentColor"
                strokeWidth={1}
                x1={PAD_LEFT}
                x2={width - PAD_RIGHT}
                y1={y}
                y2={y}
              />
              <text
                className="fill-muted-foreground text-[11px] tabular-nums"
                dominantBaseline="middle"
                textAnchor="end"
                x={PAD_LEFT - 8}
                y={y}
              >
                {formatCompact(value)}
              </text>
            </g>
          );
        })}

        {/* The hovered column's lane, so the reader sees the chart respond. */}
        {active === null ? null : (
          <rect
            className="text-foreground"
            fill="currentColor"
            height={PLOT_HEIGHT}
            opacity={0.06}
            width={band}
            x={PAD_LEFT + band * active}
            y={PAD_TOP}
          />
        )}

        {points.map((point, index) => {
          const x = centreOf(index) - barWidth / 2;
          const drawn = REVENUE_SOURCES.filter((source) => point[source] > 0);
          let cumulative = 0;

          return (
            <g key={point.date}>
              {drawn.map((source, position) => {
                const base = toY(cumulative);

                cumulative += point[source];

                const top = toY(cumulative);
                const isTop = position === drawn.length - 1;
                // The gap belongs to the segment underneath the join, so one
                // consistent 2px of surface separates every pair in the stack.
                const y = isTop ? top : top + GAP;
                const height = Math.max(base - y, 1);

                return (
                  <path
                    d={
                      isTop
                        ? cappedBar(x, y, barWidth, height)
                        : `M ${x} ${y} h ${barWidth} v ${height} h ${-barWidth} Z`
                    }
                    fill={SOURCE_COLOR[source]}
                    key={source}
                  />
                );
              })}
            </g>
          );
        })}

        {/* One direct label, on the best day in the window. A number over every
            column is noise; the extreme is the one worth naming. */}
        {peak > 0 ? (
          <text
            className="fill-foreground text-[11px] tabular-nums"
            textAnchor="middle"
            x={centreOf(peakIndex)}
            y={toY(peak) - 6}
          >
            {formatCompact(peak)}
          </text>
        ) : null}

        {/* Baseline, then the dates under it. */}
        <line
          className="text-border"
          shapeRendering="crispEdges"
          stroke="currentColor"
          strokeWidth={1}
          x1={PAD_LEFT}
          x2={width - PAD_RIGHT}
          y1={PAD_TOP + PLOT_HEIGHT}
          y2={PAD_TOP + PLOT_HEIGHT}
        />

        {points.map((point, index) =>
          index % tickEvery === 0 || index === count - 1 ? (
            <text
              className="fill-muted-foreground text-[11px] tabular-nums"
              key={point.date}
              textAnchor="middle"
              x={centreOf(index)}
              y={PAD_TOP + PLOT_HEIGHT + 17}
            >
              {formatDayTick(point.date)}
            </text>
          ) : null
        )}

        <rect
          fill="transparent"
          height={PLOT_HEIGHT + AXIS_BAND}
          onPointerLeave={() => setActive(null)}
          onPointerMove={handlePointer}
          width={plotWidth}
          x={PAD_LEFT}
          y={PAD_TOP}
        />
      </svg>

      {activePoint ? (
        <div
          className="pointer-events-none absolute z-10 min-w-40 max-w-56 -translate-x-1/2 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-md"
          style={{
            left: Math.min(
              Math.max(centreOf(active ?? 0), 96),
              Math.max(width - 96, 96)
            ),
            top: 8,
          }}
        >
          <p className="mb-2 font-medium text-caption">
            {formatDayFull(activePoint.date)}
          </p>

          <ul className="flex flex-col gap-1">
            {REVENUE_SOURCES.map((source) => (
              <li className="flex items-center gap-2 text-caption" key={source}>
                {/* A short stroke of the series colour, not a filled box: at
                    this density a box is data-weight ink doing a label's job. */}
                <span
                  className="h-0.5 w-4 shrink-0 rounded-full"
                  style={{ backgroundColor: SOURCE_COLOR[source] }}
                />
                {/* Value first, name second — the reader already has the series
                    and came here for the number. */}
                <span className="font-medium tabular-nums">
                  {formatAmount(activePoint[source])}
                </span>
                <span className="truncate text-muted-foreground">
                  {messages[SOURCE_LABEL[source]]}
                </span>
              </li>
            ))}
          </ul>

          <p className="mt-2 border-border border-t pt-2 font-semibold text-caption tabular-nums">
            {formatAmount(pointTotal(activePoint))}
          </p>
        </div>
      ) : null}

      {/* Keyboard readout. Hovering speaks to the eye; this speaks to a screen
          reader stepping the same columns with the arrow keys. */}
      <p aria-live="polite" className="sr-only">
        {activePoint
          ? `${formatDayFull(activePoint.date)}: ${formatAmount(
              pointTotal(activePoint)
            )}`
          : ""}
      </p>
    </div>
  );
};
