import { Feather } from "@expo/vector-icons";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from "react-native";
import { useMessages } from "../locale-context";
import { font, radius, space } from "../theme";
import { useTheme } from "../theme-context";

/**
 * The small pieces every screen is built from.
 *
 * Deliberately not a port of `@repo/design-system`: that package is shadcn/ui on
 * top of Tailwind and radix, none of which exists in React Native. What carries
 * over is the *vocabulary* — Card, Chip, StatTile, Empty — and the colours, so
 * the two apps stay recognisably one product without sharing a line of code.
 */

/**
 * A pressable's opacity: dimmed when it cannot be used, lighter under a finger.
 *
 * A helper rather than a chained ternary inline — every `Pressable` here needs
 * the same three-way answer, and the repo's lint bans nesting them.
 */
export const pressOpacity = (
  disabled: boolean | undefined,
  pressed: boolean,
  activeOpacity = 0.7
): number => {
  if (disabled) {
    return 0.4;
  }

  return pressed ? activeOpacity : 1;
};

/* ---------------------------------------------------------------- typography */

export const Title = ({ children }: { children: ReactNode }) => {
  const theme = useTheme();

  return (
    <Text
      style={{
        color: theme.foreground,
        fontSize: font.title,
        fontWeight: "700",
        letterSpacing: -0.3,
      }}
    >
      {children}
    </Text>
  );
};

export const Body = ({
  children,
  muted,
  numberOfLines,
}: {
  children: ReactNode;
  muted?: boolean;
  numberOfLines?: number;
}) => {
  const theme = useTheme();

  return (
    <Text
      numberOfLines={numberOfLines}
      style={{
        color: muted ? theme.mutedForeground : theme.foreground,
        fontSize: font.body,
      }}
    >
      {children}
    </Text>
  );
};

/** A tile's caption. Uppercase and tracked out so it reads at 11pt. */
export const Caption = ({ children }: { children: ReactNode }) => {
  const theme = useTheme();

  return (
    <Text
      style={{
        color: theme.mutedForeground,
        fontSize: font.caption,
        fontWeight: "600",
        letterSpacing: 0.9,
        textTransform: "uppercase",
      }}
    >
      {children}
    </Text>
  );
};

/* --------------------------------------------------------------- containers */

export const Card = ({
  children,
  style,
  tinted,
}: {
  children: ReactNode;
  style?: ViewStyle;
  tinted?: boolean;
}) => {
  const theme = useTheme();

  return (
    <View
      style={[
        {
          backgroundColor: tinted ? theme.primaryTint : theme.card,
          borderColor: tinted ? "transparent" : theme.border,
          borderRadius: radius.lg,
          borderWidth: StyleSheet.hairlineWidth,
          padding: space.lg,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
};

export const SectionHeader = ({
  title,
  trailing,
}: {
  title: string;
  trailing?: ReactNode;
}) => (
  <View
    style={{
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: space.md,
      marginTop: space.xl,
    }}
  >
    <Caption>{title}</Caption>
    {trailing}
  </View>
);

/* -------------------------------------------------------------------- tiles */

/**
 * One figure with its caption, and optionally the change from the window
 * before.
 *
 * `delta` is nullable rather than defaulting to zero: "up from nothing" has no
 * percentage, and a `+0%` where the answer is "there is no answer" is a number
 * a manager would act on.
 */
export const StatTile = ({
  caption,
  delta,
  icon,
  value,
  wide,
}: {
  caption: string;
  delta?: number | null;
  icon?: keyof typeof Feather.glyphMap;
  value: string;
  wide?: boolean;
}) => {
  const theme = useTheme();

  return (
    <Card style={{ flexGrow: 1, flexBasis: wide ? "100%" : "47%" }}>
      <View
        style={{
          alignItems: "center",
          flexDirection: "row",
          justifyContent: "space-between",
          marginBottom: space.md,
        }}
      >
        {icon ? (
          <View
            style={{
              alignItems: "center",
              backgroundColor: theme.primaryTint,
              borderRadius: radius.sm,
              height: 32,
              justifyContent: "center",
              width: 32,
            }}
          >
            <Feather color={theme.primaryAccent} name={icon} size={16} />
          </View>
        ) : (
          <View />
        )}
        <Delta value={delta} />
      </View>

      <Text
        style={{
          color: theme.foreground,
          fontSize: font.display - 6,
          fontWeight: "700",
          letterSpacing: -0.6,
          marginBottom: space.xs,
        }}
      >
        {value}
      </Text>
      <Caption>{caption}</Caption>
    </Card>
  );
};

type Direction = "down" | "flat" | "up";

/** Which way a change points. `null` and `0` are both "flat" — see below. */
const directionOf = (value: number | null): Direction => {
  if (value === null || value === 0) {
    return "flat";
  }

  return value > 0 ? "up" : "down";
};

const DELTA_ICON: Record<Direction, keyof typeof Feather.glyphMap> = {
  down: "trending-down",
  flat: "minus",
  up: "trending-up",
};

export const Delta = ({ value }: { value?: number | null }) => {
  const theme = useTheme();

  if (value === undefined) {
    return null;
  }

  // Null means the previous window was zero — say so with a dash, not a number.
  const direction = directionOf(value);
  const flat = direction === "flat";
  const up = direction === "up";

  const tone = {
    down: theme.destructive,
    flat: theme.mutedForeground,
    up: theme.primaryAccent,
  }[direction];

  const icon = DELTA_ICON[direction];

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: theme.raised,
        borderRadius: radius.pill,
        flexDirection: "row",
        gap: 3,
        paddingHorizontal: space.sm,
        paddingVertical: 3,
      }}
    >
      <Feather color={tone} name={icon} size={11} />
      <Text style={{ color: tone, fontSize: font.caption, fontWeight: "600" }}>
        {flat ? "0.0%" : `${up ? "+" : ""}${value}%`}
      </Text>
    </View>
  );
};

/** A compact figure for the horizontal strip under the hero card. */
export const MiniTile = ({
  caption,
  icon,
  tone,
  value,
}: {
  caption: string;
  icon: keyof typeof Feather.glyphMap;
  tone?: "default" | "warning" | "danger";
  value: string;
}) => {
  const theme = useTheme();
  const accent = {
    danger: theme.destructive,
    default: theme.primaryAccent,
    warning: theme.warning,
  }[tone ?? "default"];

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: theme.card,
        borderColor: theme.border,
        borderRadius: radius.lg,
        borderWidth: StyleSheet.hairlineWidth,
        flexDirection: "row",
        gap: space.md,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
      }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: theme.raised,
          borderRadius: radius.sm,
          height: 34,
          justifyContent: "center",
          width: 34,
        }}
      >
        <Feather color={accent} name={icon} size={16} />
      </View>
      <View>
        <Text
          style={{
            color: theme.foreground,
            fontSize: font.body,
            fontWeight: "700",
            marginBottom: 2,
          }}
        >
          {value}
        </Text>
        <Caption>{caption}</Caption>
      </View>
    </View>
  );
};

/* -------------------------------------------------------------------- chips */

export interface ChipOption<T extends string> {
  /** Shown after the label — a filter's tally. */
  count?: number;
  label: string;
  value: T;
}

/**
 * The filter row. One selected value, scrolling horizontally.
 *
 * Selected is a green **tint with a green edge and green text**, not a solid
 * neon fill — the same rule `@repo/design-system/lib/selected` enforces on the
 * desk. The neon is a 1.7:1 contrast and cannot carry text on top of it.
 */
export const ChipRow = <T extends string>({
  onChange,
  options,
  value,
}: {
  onChange: (value: T) => void;
  options: readonly ChipOption<T>[];
  value: T;
}) => {
  const theme = useTheme();

  return (
    <ScrollView
      contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg }}
      horizontal
      showsHorizontalScrollIndicator={false}
    >
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => ({
              backgroundColor: selected ? theme.primaryTint : theme.card,
              borderColor: selected ? theme.primaryAccent : theme.border,
              borderRadius: radius.pill,
              borderWidth: 1,
              flexDirection: "row",
              gap: 6,
              opacity: pressed ? 0.7 : 1,
              paddingHorizontal: space.lg,
              paddingVertical: space.sm,
            })}
          >
            <Text
              style={{
                color: selected ? theme.primaryAccent : theme.mutedForeground,
                fontSize: font.label,
                fontWeight: "600",
              }}
            >
              {option.label}
            </Text>
            {option.count === undefined ? null : (
              <Text
                style={{
                  color: selected ? theme.primaryAccent : theme.mutedForeground,
                  fontSize: font.label,
                  fontWeight: "600",
                  opacity: 0.7,
                }}
              >
                {option.count}
              </Text>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
};

export type BadgeTone = "bad" | "good" | "neutral" | "warn";

/** A status pill: in stock, expiring, on shift. */
export const Badge = ({ label, tone }: { label: string; tone: BadgeTone }) => {
  const theme = useTheme();
  const color = {
    bad: theme.destructive,
    good: theme.primaryAccent,
    neutral: theme.mutedForeground,
    warn: theme.warning,
  }[tone];

  return (
    <View
      style={{
        backgroundColor: theme.raised,
        borderRadius: radius.sm,
        paddingHorizontal: space.sm,
        paddingVertical: 3,
      }}
    >
      <Text style={{ color, fontSize: font.caption, fontWeight: "700" }}>
        {label}
      </Text>
    </View>
  );
};

/* ------------------------------------------------------------------- search */

export const SearchField = ({
  onChange,
  placeholder,
  value,
}: {
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) => {
  const theme = useTheme();

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: theme.card,
        borderColor: theme.border,
        borderRadius: radius.md,
        borderWidth: StyleSheet.hairlineWidth,
        flexDirection: "row",
        gap: space.sm,
        marginHorizontal: space.lg,
        paddingHorizontal: space.md,
      }}
    >
      <Feather color={theme.mutedForeground} name="search" size={16} />
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.mutedForeground}
        style={{
          color: theme.foreground,
          flex: 1,
          fontSize: font.body,
          paddingVertical: space.md,
        }}
        value={value}
      />
    </View>
  );
};

/* -------------------------------------------------------------------- state */

export const Spinner = () => {
  const theme = useTheme();

  return (
    <View style={{ paddingVertical: space.xxl * 2 }}>
      <ActivityIndicator color={theme.primaryAccent} />
    </View>
  );
};

export const Empty = ({ label }: { label?: string }) => {
  const theme = useTheme();
  const messages = useMessages();

  return (
    <View style={{ alignItems: "center", paddingVertical: space.xxl }}>
      <Feather color={theme.mutedForeground} name="inbox" size={22} />
      <Text
        style={{
          color: theme.mutedForeground,
          fontSize: font.label,
          marginTop: space.sm,
        }}
      >
        {label ?? messages["common.empty"]}
      </Text>
    </View>
  );
};

export const ErrorState = ({ onRetry }: { onRetry: () => void }) => {
  const theme = useTheme();
  const messages = useMessages();

  return (
    <View style={{ alignItems: "center", padding: space.xxl }}>
      <Feather color={theme.destructive} name="alert-circle" size={24} />
      <Text
        style={{
          color: theme.foreground,
          fontSize: font.body,
          marginTop: space.md,
        }}
      >
        {messages["common.error"]}
      </Text>
      <Button label={messages["common.retry"]} onPress={onRetry} subtle />
    </View>
  );
};

/* ------------------------------------------------------------------ buttons */

export const Button = ({
  disabled,
  label,
  loading,
  onPress,
  subtle,
}: {
  disabled?: boolean;
  label: string;
  loading?: boolean;
  onPress: () => void;
  subtle?: boolean;
}) => {
  const theme = useTheme();
  const inert = disabled || loading;

  return (
    <Pressable
      disabled={inert}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        backgroundColor: subtle ? "transparent" : theme.primary,
        borderColor: subtle ? theme.border : "transparent",
        borderRadius: radius.md,
        borderWidth: subtle ? 1 : 0,
        justifyContent: "center",
        marginTop: space.lg,
        opacity: pressOpacity(inert, pressed, 0.85),
        paddingHorizontal: space.xl,
        paddingVertical: space.lg,
      })}
    >
      {loading ? (
        <ActivityIndicator
          color={subtle ? theme.foreground : theme.primaryForeground}
        />
      ) : (
        <Text
          style={{
            color: subtle ? theme.foreground : theme.primaryForeground,
            fontSize: font.body,
            fontWeight: "700",
          }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
};

/** Initials in a circle. Used for the header and every member row. */
export const Avatar = ({
  initials,
  size = 44,
}: {
  initials: string;
  size?: number;
}) => {
  const theme = useTheme();

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: theme.primary,
        borderRadius: size / 2,
        height: size,
        justifyContent: "center",
        width: size,
      }}
    >
      <Text
        style={{
          color: theme.primaryForeground,
          fontSize: size * 0.36,
          fontWeight: "700",
        }}
      >
        {initials}
      </Text>
    </View>
  );
};

/**
 * One row of a list: a leading circle, two lines of text, and a trailing figure.
 *
 * Every list in this app is this shape. Keeping it one component is what stops
 * members, staff and attendance drifting into three different row heights.
 */
export const ListRow = ({
  leading,
  onPress,
  subtitle,
  title,
  trailing,
  trailingCaption,
}: {
  leading?: ReactNode;
  onPress?: () => void;
  subtitle?: string;
  title: string;
  trailing?: ReactNode;
  trailingCaption?: string;
}) => {
  const theme = useTheme();

  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        borderBottomColor: theme.border,
        borderBottomWidth: StyleSheet.hairlineWidth,
        flexDirection: "row",
        gap: space.md,
        opacity: pressed ? 0.6 : 1,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
      })}
    >
      {leading}

      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={1}
          style={{
            color: theme.foreground,
            fontSize: font.body,
            fontWeight: "600",
          }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={1}
            style={{
              color: theme.mutedForeground,
              fontSize: font.label,
              marginTop: 2,
            }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>

      <View style={{ alignItems: "flex-end", gap: 3 }}>
        {trailing}
        {trailingCaption ? (
          <Text
            style={{ color: theme.mutedForeground, fontSize: font.caption }}
          >
            {trailingCaption}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
};
