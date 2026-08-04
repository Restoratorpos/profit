import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Constants from "expo-constants";
import { router } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { gymQuery } from "@/api/queries";
import { useAuth } from "@/auth/context";
import { Button, Caption, Card } from "@/components/ui";
import { LOCALES, type MessageKey } from "@/i18n";
import { formatPhoneDigits } from "@/lib/phone";
import { useLocale } from "@/locale-context";
import { font, radius, space } from "@/theme";
import { useTheme } from "@/theme-context";

/**
 * Who is signed in, which gym, and the way out.
 *
 * Opened from the top-right of the home screen as a modal rather than a sixth
 * tab: it is a place you visit, not a place you work. There is deliberately no
 * settings surface here — the gym's name and hours are the desk's to change,
 * and `PATCH /gym` is owner-and-admin only anyway.
 */
export default function Profile() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { locale, messages, setLocale } = useLocale();
  const { signOut, user } = useAuth();
  const queryClient = useQueryClient();

  const [busy, setBusy] = useState(false);

  const gym = useQuery(gymQuery());

  const roleKey = `role.${user?.role ?? "manager"}` as MessageKey;

  const confirmSignOut = () => {
    Alert.alert(messages["profile.signOutConfirm"], undefined, [
      { style: "cancel", text: messages["common.cancel"] },
      {
        onPress: () => {
          setBusy(true);

          /*
           * Clear the cache on the way out. Without it the next person to sign
           * in on this phone sees the previous gym's figures for as long as it
           * takes their own to arrive — cached under keys that carry no tenant,
           * because the tenant is a claim in the token rather than part of a URL.
           */
          signOut()
            .then(() => {
              queryClient.clear();
              router.replace("/sign-in");
            })
            .finally(() => {
              setBusy(false);
            });
        },
        style: "destructive",
        text: messages["profile.signOut"],
      },
    ]);
  };

  return (
    <ScrollView
      contentContainerStyle={{
        paddingBottom: insets.bottom + space.xxl,
        paddingHorizontal: space.lg,
        paddingTop: space.lg,
      }}
      style={{ backgroundColor: theme.background, flex: 1 }}
    >
      <View
        style={{
          alignItems: "center",
          flexDirection: "row",
          justifyContent: "space-between",
          marginBottom: space.xl,
        }}
      >
        <Text
          style={{
            color: theme.foreground,
            fontSize: font.title + 4,
            fontWeight: "700",
          }}
        >
          {messages["profile.title"]}
        </Text>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => ({
            alignItems: "center",
            backgroundColor: theme.card,
            borderRadius: radius.pill,
            height: 34,
            justifyContent: "center",
            opacity: pressed ? 0.7 : 1,
            width: 34,
          })}
        >
          <Feather color={theme.foreground} name="x" size={17} />
        </Pressable>
      </View>

      <Card>
        <Row label={messages["profile.title"]} value={user?.name ?? "—"} />
        <Row label={messages["profile.role"]} value={messages[roleKey]} />
        <Row
          label={messages["profile.phone"]}
          value={formatPhoneDigits(user?.phone ?? "")}
        />
      </Card>

      <View style={{ marginTop: space.lg }}>
        <Card>
          <Row label={messages["profile.gym"]} value={gym.data?.name ?? "—"} />
          <Row
            label={messages["profile.branch"]}
            value={gym.data?.branchName ?? "—"}
          />
        </Card>
      </View>

      {/* ---------------------------------------------------------- language */}
      <View style={{ marginTop: space.xl }}>
        <Caption>{messages["profile.language"]}</Caption>
      </View>

      <View style={{ gap: space.sm, marginTop: space.md }}>
        {LOCALES.map((entry) => (
          <LocaleRow
            key={entry.code}
            label={entry.label}
            onPress={() => setLocale(entry.code)}
            selected={entry.code === locale}
          />
        ))}
      </View>

      <Button
        label={messages["profile.signOut"]}
        loading={busy}
        onPress={confirmSignOut}
        subtle
      />

      <Text
        style={{
          color: theme.mutedForeground,
          fontSize: font.caption,
          marginTop: space.xl,
          textAlign: "center",
        }}
      >
        {messages["profile.version"]} {Constants.expoConfig?.version ?? "—"}
      </Text>
    </ScrollView>
  );
}

const Row = ({ label, value }: { label: string; value: string }) => {
  const theme = useTheme();

  return (
    <View
      style={{
        alignItems: "center",
        flexDirection: "row",
        justifyContent: "space-between",
        paddingVertical: space.sm,
      }}
    >
      <Text style={{ color: theme.mutedForeground, fontSize: font.label }}>
        {label}
      </Text>
      <Text
        numberOfLines={1}
        style={{
          color: theme.foreground,
          flexShrink: 1,
          fontSize: font.body,
          fontWeight: "600",
          marginLeft: space.lg,
          textAlign: "right",
        }}
      >
        {value}
      </Text>
    </View>
  );
};

const LocaleRow = ({
  label,
  onPress,
  selected,
}: {
  label: string;
  onPress: () => void;
  selected: boolean;
}) => {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        /*
         * The same "selected" rule the desk holds to: a green tint with a green
         * edge and green text, never a solid neon fill.
         */
        backgroundColor: selected ? theme.primaryTint : theme.card,
        borderColor: selected ? theme.primaryAccent : theme.border,
        borderRadius: radius.md,
        borderWidth: selected ? 1 : StyleSheet.hairlineWidth,
        flexDirection: "row",
        justifyContent: "space-between",
        opacity: pressed ? 0.7 : 1,
        paddingHorizontal: space.lg,
        paddingVertical: space.lg,
      })}
    >
      <Text
        style={{
          color: selected ? theme.primaryAccent : theme.foreground,
          fontSize: font.body,
          fontWeight: selected ? "700" : "500",
        }}
      >
        {label}
      </Text>
      {selected ? (
        <Feather color={theme.primaryAccent} name="check" size={17} />
      ) : null}
    </Pressable>
  );
};
