import { Feather } from "@expo/vector-icons";
import { Redirect } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError } from "@/api/client";
import { useAuth } from "@/auth/context";
import { PhoneField } from "@/components/phone-field";
import { Button } from "@/components/ui";
import {
  type Country,
  DEFAULT_COUNTRY_CODE,
  findCountry,
  isCompleteNational,
  toFullPhone,
} from "@/lib/countries";
import { useMessages } from "@/locale-context";
import { font, radius, space } from "@/theme";
import { useTheme } from "@/theme-context";

/**
 * The only screen reachable signed out.
 *
 * The phone is deliberately **not** a place to register: `/auth/register`
 * onboards a whole tenant — a gym, a branch and an owner in one transaction —
 * and that is a decision made once, at a desk, not on a phone. A manager who
 * has no account needs one created for them.
 */
export default function SignIn() {
  const { signIn, status } = useAuth();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const messages = useMessages();

  /*
   * The number is held in two pieces — the country, and the national digits
   * behind its dial code — and only assembled at submit. Bare digits either
   * way: `toFullPhone` is what the backend stores and compares, and the
   * grouping the field shows never leaves the screen.
   */
  const [country, setCountry] = useState<Country>(
    findCountry(DEFAULT_COUNTRY_CODE)
  );
  const [national, setNational] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === "authenticated") {
    return <Redirect href="/(tabs)" />;
  }

  const submit = async () => {
    if (national.length === 0) {
      setError(messages["auth.phoneRequired"]);

      return;
    }

    // Caught here rather than at the server: nine digits is not a credential
    // failure, and spending a rate-limit attempt on a half-typed number is rude.
    if (!isCompleteNational(national, country)) {
      setError(messages["auth.phoneIncomplete"]);

      return;
    }

    if (password.length === 0) {
      setError(messages["auth.passwordRequired"]);

      return;
    }

    setBusy(true);
    setError(null);

    try {
      await signIn(toFullPhone(national, country), password);
    } catch (cause) {
      /*
       * The backend refuses to say whether a phone exists — same status, same
       * message, and it pays for a bcrypt hash even with no user so the timing
       * does not leak either. Mirroring that here means one message for every
       * credential failure, and a distinct one only for the two cases that are
       * not about credentials at all.
       */
      if (cause instanceof ApiError && cause.status === 429) {
        setError(messages["auth.tooMany"]);
      } else if (cause instanceof ApiError && cause.status === 0) {
        setError(messages["auth.offline"]);
      } else {
        setError(messages["auth.invalid"]);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ backgroundColor: theme.background, flex: 1 }}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          paddingBottom: insets.bottom + space.xxl,
          paddingHorizontal: space.xl,
          paddingTop: insets.top + space.xxl,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={{
            alignItems: "center",
            backgroundColor: theme.primary,
            borderRadius: radius.xl,
            height: 60,
            justifyContent: "center",
            marginBottom: space.xl,
            width: 60,
          }}
        >
          <Feather color={theme.primaryForeground} name="activity" size={28} />
        </View>

        <Text
          style={{
            color: theme.foreground,
            fontSize: font.display,
            fontWeight: "700",
            letterSpacing: -0.8,
          }}
        >
          {messages["auth.title"]}
        </Text>
        <Text
          style={{
            color: theme.mutedForeground,
            fontSize: font.body,
            marginBottom: space.xxl,
            marginTop: space.xs,
          }}
        >
          {messages["auth.subtitle"]}
        </Text>

        <PhoneField
          autoFocus
          country={country}
          disabled={busy}
          label={messages["auth.phone"]}
          national={national}
          onChangeCountry={setCountry}
          onChangeNational={setNational}
        />

        <Field
          disabled={busy}
          label={messages["auth.password"]}
          onChangeText={setPassword}
          onSubmitEditing={submit}
          placeholder="••••"
          returnKeyType="go"
          secureTextEntry
          value={password}
        />

        {error ? (
          <View
            style={{
              alignItems: "center",
              flexDirection: "row",
              gap: space.sm,
              marginTop: space.lg,
            }}
          >
            <Feather color={theme.destructive} name="alert-circle" size={14} />
            <Text style={{ color: theme.destructive, fontSize: font.label }}>
              {error}
            </Text>
          </View>
        ) : null}

        <Button
          label={messages["auth.submit"]}
          loading={busy}
          onPress={submit}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/**
 * A labelled input. Stays mounted and merely `editable={false}` while
 * submitting — hiding or clearing a field mid-submit is the rule the desk app
 * holds to, and a phone keyboard dismissing under someone's thumb is worse.
 */
const Field = ({
  disabled,
  label,
  onChangeText,
  onSubmitEditing,
  placeholder,
  returnKeyType,
  secureTextEntry,
  value,
}: {
  disabled?: boolean;
  label: string;
  onChangeText: (value: string) => void;
  onSubmitEditing?: () => void;
  placeholder: string;
  returnKeyType?: "go";
  secureTextEntry?: boolean;
  value: string;
}) => {
  const theme = useTheme();

  return (
    <View style={{ marginTop: space.lg }}>
      <Text
        style={{
          color: theme.mutedForeground,
          fontSize: font.label,
          fontWeight: "600",
          marginBottom: space.sm,
        }}
      >
        {label}
      </Text>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        editable={!disabled}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        placeholder={placeholder}
        placeholderTextColor={theme.mutedForeground}
        returnKeyType={returnKeyType}
        secureTextEntry={secureTextEntry}
        style={{
          backgroundColor: theme.card,
          borderColor: theme.border,
          borderRadius: radius.md,
          borderWidth: StyleSheet.hairlineWidth,
          color: theme.foreground,
          fontSize: font.body,
          paddingHorizontal: space.lg,
          paddingVertical: space.lg,
        }}
        value={value}
      />
    </View>
  );
};
