import { Feather } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Redirect, Tabs } from "expo-router";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/context";
import { useMessages } from "@/locale-context";
import { font, radius, space } from "@/theme";
import { useTheme } from "@/theme-context";

/**
 * The five tabs, with Home raised in the middle.
 *
 * The bar is drawn by hand rather than styled through `tabBarStyle` because the
 * centre button breaks out of the bar's own bounds, and a tab bar cannot render
 * a child taller than itself. Everything else — routing, state, the active
 * index — is still React Navigation's; only the pixels are ours.
 *
 * Order is deliberate: the two screens a manager opens *about people* sit left,
 * the two *about things* sit right, and Home is the thumb's resting position.
 */

const TABS = [
  { icon: "users", key: "members", label: "nav.members" },
  { icon: "check-square", key: "attendance", label: "nav.attendance" },
  { icon: "home", key: "index", label: "nav.home" },
  { icon: "box", key: "storage", label: "nav.storage" },
  { icon: "briefcase", key: "staff", label: "nav.staff" },
] as const;

export default function TabsLayout() {
  const { status } = useAuth();

  /*
   * The guard is here rather than in a middleware because there is no server to
   * run middleware on — the same reason the desk app uses an `_authed` layout
   * route. Every tab is a child of this layout, so one check covers all five.
   */
  if (status === "signed-out") {
    return <Redirect href="/sign-in" />;
  }

  if (status !== "authenticated") {
    return <Redirect href="/" />;
  }

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} />}
    >
      {TABS.map((tab) => (
        <Tabs.Screen key={tab.key} name={tab.key} />
      ))}
    </Tabs>
  );
}

const TabBar = ({ navigation, state }: BottomTabBarProps) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const messages = useMessages();

  return (
    <View
      style={{
        backgroundColor: theme.card,
        borderTopColor: theme.border,
        borderTopWidth: StyleSheet.hairlineWidth,
        flexDirection: "row",
        /*
         * The home indicator on iOS and the gesture pill on Android sit inside
         * this inset. Padding rather than margin so the bar's own background
         * still reaches the bottom edge of the screen.
         */
        paddingBottom: insets.bottom + space.sm,
        paddingTop: space.sm,
      }}
    >
      {state.routes.map((route, index) => {
        const tab = TABS.find((entry) => entry.key === route.name);

        if (!tab) {
          return null;
        }

        const focused = state.index === index;
        const label = messages[tab.label];

        const onPress = () => {
          const event = navigation.emit({
            canPreventDefault: true,
            target: route.key,
            type: "tabPress",
          });

          if (!(focused || event.defaultPrevented)) {
            navigation.navigate(route.name);
          }
        };

        if (tab.key === "index") {
          return (
            <HomeTab
              focused={focused}
              key={route.key}
              label={label}
              onPress={onPress}
            />
          );
        }

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            style={({ pressed }) => ({
              alignItems: "center",
              flex: 1,
              gap: 4,
              opacity: pressed ? 0.6 : 1,
              paddingVertical: space.sm,
            })}
          >
            <Feather
              color={focused ? theme.primaryAccent : theme.mutedForeground}
              name={tab.icon}
              size={21}
            />
            <Text
              numberOfLines={1}
              style={{
                color: focused ? theme.primaryAccent : theme.mutedForeground,
                fontSize: font.caption,
                fontWeight: focused ? "700" : "500",
              }}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

/**
 * The raised centre button.
 *
 * `marginTop` is negative so the circle overhangs the bar's top edge; the label
 * below it stays on the same baseline as the other four so the row still reads
 * as one strip rather than a button with a bar around it.
 */
const HomeTab = ({
  focused,
  label,
  onPress,
}: {
  focused: boolean;
  label: string;
  onPress: () => void;
}) => {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        flex: 1,
        gap: 4,
        opacity: pressed ? 0.85 : 1,
        paddingVertical: space.sm,
      })}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: theme.primary,
          borderColor: theme.card,
          borderRadius: radius.pill,
          borderWidth: 4,
          height: 58,
          justifyContent: "center",
          marginTop: -30,
          width: 58,
          /*
           * The glow. Android takes `elevation`, iOS takes the shadow triple —
           * setting both is how one raised button looks raised on both.
           */
          ...Platform.select({
            android: { elevation: 8 },
            ios: {
              shadowColor: theme.primary,
              shadowOffset: { height: 4, width: 0 },
              shadowOpacity: 0.4,
              shadowRadius: 10,
            },
          }),
        }}
      >
        <Feather color={theme.primaryForeground} name="home" size={24} />
      </View>
      <Text
        numberOfLines={1}
        style={{
          color: focused ? theme.primaryAccent : theme.mutedForeground,
          fontSize: font.caption,
          fontWeight: focused ? "700" : "500",
          marginTop: -22,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
};
