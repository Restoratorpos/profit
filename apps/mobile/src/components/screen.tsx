import { Feather } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMessages } from "../locale-context";
import { font, radius, space } from "../theme";
import { useTheme } from "../theme-context";
import { pressOpacity } from "./ui";

/**
 * The frame every tab renders inside.
 *
 * It owns the status-bar inset so no screen has to think about the notch, and it
 * owns the bottom padding that keeps the last list row clear of the tab bar —
 * which is a floating element, so content scrolling under it would otherwise end
 * up permanently unreadable.
 */

/** Height of the tab bar plus the raised centre button's overhang. */
export const TAB_BAR_CLEARANCE = 96;

export const ScreenHeader = ({
  subtitle,
  title,
  trailing,
}: {
  subtitle?: string;
  title: string;
  trailing?: ReactNode;
}) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        alignItems: "flex-end",
        flexDirection: "row",
        justifyContent: "space-between",
        paddingBottom: space.md,
        paddingHorizontal: space.lg,
        paddingTop: insets.top + space.md,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: theme.foreground,
            fontSize: font.title + 6,
            fontWeight: "700",
            letterSpacing: -0.6,
          }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
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
      {trailing}
    </View>
  );
};

/**
 * Previous / next, with the position between them.
 *
 * A phone list is scrolled, not paged, so this only appears when the backend
 * says there is more than one page — which at `pageSize: 25` most gyms never
 * see on the staff screen and always see on members.
 */
export const Pager = ({
  onChange,
  page,
  pageSize,
  total,
}: {
  onChange: (page: number) => void;
  page: number;
  pageSize: number;
  total: number;
}) => {
  const theme = useTheme();
  const messages = useMessages();
  const pages = Math.max(1, Math.ceil(total / pageSize));

  if (pages <= 1) {
    return null;
  }

  const step = (delta: number) => {
    const next = Math.min(pages, Math.max(1, page + delta));

    if (next !== page) {
      onChange(next);
    }
  };

  return (
    <View
      style={{
        alignItems: "center",
        flexDirection: "row",
        gap: space.lg,
        justifyContent: "center",
        paddingVertical: space.xl,
      }}
    >
      <PagerButton
        disabled={page <= 1}
        icon="chevron-left"
        onPress={() => step(-1)}
      />
      <Text style={{ color: theme.mutedForeground, fontSize: font.label }}>
        {page} {messages["common.of"]} {pages}
      </Text>
      <PagerButton
        disabled={page >= pages}
        icon="chevron-right"
        onPress={() => step(1)}
      />
    </View>
  );
};

const PagerButton = ({
  disabled,
  icon,
  onPress,
}: {
  disabled: boolean;
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
}) => {
  const theme = useTheme();

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        backgroundColor: theme.card,
        borderColor: theme.border,
        borderRadius: radius.md,
        borderWidth: 1,
        height: 40,
        justifyContent: "center",
        opacity: pressOpacity(disabled, pressed),
        width: 48,
      })}
    >
      <Feather color={theme.foreground} name={icon} size={18} />
    </Pressable>
  );
};
