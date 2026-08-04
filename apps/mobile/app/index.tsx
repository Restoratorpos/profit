import { Feather } from "@expo/vector-icons";
import { Redirect } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";
import { useAuth } from "@/auth/context";
import { Button } from "@/components/ui";
import { useMessages } from "@/locale-context";
import { font, space } from "@/theme";
import { useTheme } from "@/theme-context";

/**
 * Where a cold launch lands.
 *
 * Three destinations, not two — the third is the point. `offline` means the API
 * could not be reached, which says nothing about whether the session is valid,
 * so it gets its own screen with a retry. Sending someone to the sign-in form
 * instead would ask them to authenticate against the server that just failed to
 * answer, and they would be stuck there.
 */
export default function Boot() {
  const { retry, status } = useAuth();
  const theme = useTheme();
  const messages = useMessages();

  if (status === "authenticated") {
    return <Redirect href="/(tabs)" />;
  }

  if (status === "signed-out") {
    return <Redirect href="/sign-in" />;
  }

  if (status === "offline") {
    return (
      <View
        style={{
          alignItems: "center",
          backgroundColor: theme.background,
          flex: 1,
          justifyContent: "center",
          paddingHorizontal: space.xxl,
        }}
      >
        <Feather color={theme.mutedForeground} name="wifi-off" size={30} />
        <Text
          style={{
            color: theme.foreground,
            fontSize: font.title,
            fontWeight: "700",
            marginTop: space.lg,
            textAlign: "center",
          }}
        >
          {messages["boot.offline"]}
        </Text>
        <Text
          style={{
            color: theme.mutedForeground,
            fontSize: font.body,
            marginTop: space.sm,
            textAlign: "center",
          }}
        >
          {messages["boot.offlineHint"]}
        </Text>
        <Button label={messages["boot.retry"]} onPress={retry} />
      </View>
    );
  }

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: theme.background,
        flex: 1,
        justifyContent: "center",
      }}
    >
      <ActivityIndicator color={theme.primaryAccent} />
    </View>
  );
}
