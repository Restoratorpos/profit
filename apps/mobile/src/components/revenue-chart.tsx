import { Text, View } from "react-native";
import { useMessages } from "../locale-context";
import { font, radius, space } from "../theme";
import { useTheme } from "../theme-context";
import { pointTotal, type RevenuePoint } from "../types";

/**
 * Daily revenue as stacked bars.
 *
 * Drawn with plain `View`s rather than `react-native-svg`: the whole chart is
 * "one column per day, three segments per column", and a rectangle is something
 * React Native already draws. Adding an SVG renderer for it would be a native
 * dependency, a Metro config note and an EAS rebuild for no pixels gained.
 *
 * The three segments stack in the order the desk learned them — memberships at
 * the bottom, then shop, then other. **That order is the colour assignment**, so
 * reordering it repaints every series and lies to whoever learned the old one.
 */

const CHART_HEIGHT = 120;

/** Below this a bar is a colour with no height; give it one so it stays visible. */
const MIN_SEGMENT = 2;

/**
 * Space between columns, narrowing as they multiply.
 *
 * At 90 days a 4px gap is wider than the bar it separates, and the chart reads
 * as stripes rather than a trend.
 */
const gapFor = (count: number): number => {
  if (count > 45) {
    return 1;
  }

  return count > 20 ? 2 : 4;
};

export const RevenueChart = ({
  points,
}: {
  points: readonly RevenuePoint[];
}) => {
  const theme = useTheme();
  const messages = useMessages();

  let peak = 0;

  for (const point of points) {
    const total = pointTotal(point);

    if (total > peak) {
      peak = total;
    }
  }

  if (points.length === 0 || peak <= 0) {
    return (
      <View
        style={{
          alignItems: "center",
          height: CHART_HEIGHT,
          justifyContent: "center",
        }}
      >
        <Text style={{ color: theme.mutedForeground, fontSize: font.label }}>
          {messages["home.noChart"]}
        </Text>
      </View>
    );
  }

  const gap = gapFor(points.length);

  return (
    <View
      style={{
        alignItems: "flex-end",
        flexDirection: "row",
        gap,
        height: CHART_HEIGHT,
      }}
    >
      {points.map((point) => {
        const total = pointTotal(point);
        const height = Math.max(
          (total / peak) * CHART_HEIGHT,
          total > 0 ? 3 : 1
        );

        // Each segment's share of this column, in pixels of the column's height.
        const segment = (value: number): number =>
          total > 0 && value > 0
            ? Math.max((value / total) * height, MIN_SEGMENT)
            : 0;

        return (
          <View
            key={point.date}
            style={{
              backgroundColor: total > 0 ? "transparent" : theme.border,
              borderRadius: 2,
              flex: 1,
              height,
              justifyContent: "flex-end",
              overflow: "hidden",
            }}
          >
            <View
              style={{
                backgroundColor: theme.chart[2],
                height: segment(point.other),
              }}
            />
            <View
              style={{
                backgroundColor: theme.chart[1],
                height: segment(point.shop),
              }}
            />
            <View
              style={{
                backgroundColor: theme.chart[0],
                height: segment(point.membership),
              }}
            />
          </View>
        );
      })}
    </View>
  );
};

/** What each colour in the chart means. */
export const ChartLegend = ({
  labels,
}: {
  labels: readonly [string, string, string];
}) => {
  const theme = useTheme();

  return (
    <View
      style={{
        flexDirection: "row",
        gap: space.lg,
        marginTop: space.md,
      }}
    >
      {labels.map((label, index) => (
        <View
          key={label}
          style={{ alignItems: "center", flexDirection: "row", gap: 6 }}
        >
          <View
            style={{
              backgroundColor: theme.chart[index],
              borderRadius: radius.sm / 2,
              height: 8,
              width: 8,
            }}
          />
          <Text
            style={{ color: theme.mutedForeground, fontSize: font.caption }}
          >
            {label}
          </Text>
        </View>
      ))}
    </View>
  );
};
