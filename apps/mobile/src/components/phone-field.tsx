import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  COUNTRIES,
  type Country,
  flagEmoji,
  formatNational,
  toNationalDigits,
} from "../lib/countries";
import { useMessages } from "../locale-context";
import { font, radius, space } from "../theme";
import { useTheme } from "../theme-context";
import { pressOpacity } from "./ui";

/**
 * Country picker + national number, the phone's answer to
 * `packages/auth/components/phone-field.tsx`.
 *
 * Controlled, and the state it holds is **bare digits** — the input merely
 * displays them grouped, and `toFullPhone` assembles what gets sent. This is
 * the same rule the desk app follows: a formatted string is never stored, sent
 * or compared.
 *
 * The caret is deliberately not managed. The web version restores it after
 * every reformat because a mouse can land in the middle of a number; on a phone
 * entry is a thumb on a keypad, appending, and RN's `selection` prop fights the
 * Android soft keyboard badly enough that the cure is worse than the disease.
 */
export const PhoneField = ({
  autoFocus,
  country,
  disabled,
  label,
  national,
  onChangeCountry,
  onChangeNational,
  onSubmitEditing,
}: {
  autoFocus?: boolean;
  country: Country;
  disabled?: boolean;
  label: string;
  /** Bare national digits — no dial code, no spaces. */
  national: string;
  onChangeCountry: (country: Country) => void;
  onChangeNational: (national: string) => void;
  onSubmitEditing?: () => void;
}) => {
  const theme = useTheme();
  const messages = useMessages();
  const [picking, setPicking] = useState(false);

  const choose = (next: Country) => {
    setPicking(false);
    onChangeCountry(next);
    /*
     * Re-trim rather than clear: switching UZ → TM must not silently leave a
     * 9-digit number in a field that only accepts 8, but retyping a number
     * because you corrected the country is a punishment.
     */
    onChangeNational(toNationalDigits(national, next));
  };

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

      <View
        style={{
          alignItems: "center",
          backgroundColor: theme.card,
          borderColor: theme.border,
          borderRadius: radius.md,
          borderWidth: StyleSheet.hairlineWidth,
          flexDirection: "row",
        }}
      >
        <Pressable
          disabled={disabled}
          onPress={() => setPicking(true)}
          style={({ pressed }) => ({
            alignItems: "center",
            flexDirection: "row",
            gap: space.xs,
            opacity: pressOpacity(disabled, pressed),
            paddingHorizontal: space.lg,
            paddingVertical: space.lg,
          })}
        >
          <Text style={{ fontSize: font.body + 2 }}>
            {flagEmoji(country.code)}
          </Text>
          <Text
            style={{
              color: theme.foreground,
              fontSize: font.body,
              fontWeight: "600",
            }}
          >
            +{country.dialCode}
          </Text>
          <Feather
            color={theme.mutedForeground}
            name="chevron-down"
            size={14}
          />
        </Pressable>

        <View
          style={{
            backgroundColor: theme.border,
            height: 22,
            width: StyleSheet.hairlineWidth,
          }}
        />

        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus={autoFocus}
          editable={!disabled}
          keyboardType="phone-pad"
          onChangeText={(text) =>
            onChangeNational(toNationalDigits(text, country))
          }
          onSubmitEditing={onSubmitEditing}
          placeholder={country.example}
          placeholderTextColor={theme.mutedForeground}
          style={{
            color: theme.foreground,
            flex: 1,
            fontSize: font.body,
            paddingHorizontal: space.lg,
            paddingVertical: space.lg,
          }}
          textContentType="telephoneNumber"
          value={formatNational(national, country)}
        />
      </View>

      <Modal
        animationType="fade"
        onRequestClose={() => setPicking(false)}
        transparent
        visible={picking}
      >
        <Pressable
          onPress={() => setPicking(false)}
          style={{
            backgroundColor: "rgba(0,0,0,0.55)",
            flex: 1,
            justifyContent: "center",
            padding: space.xl,
          }}
        >
          {/* Swallows the tap so choosing inside the sheet does not close it. */}
          <Pressable
            onPress={() => undefined}
            style={{
              backgroundColor: theme.card,
              borderColor: theme.border,
              borderRadius: radius.lg,
              borderWidth: StyleSheet.hairlineWidth,
              maxHeight: "70%",
              overflow: "hidden",
            }}
          >
            <Text
              style={{
                color: theme.mutedForeground,
                fontSize: font.caption,
                fontWeight: "600",
                letterSpacing: 0.9,
                paddingHorizontal: space.lg,
                paddingTop: space.lg,
                textTransform: "uppercase",
              }}
            >
              {messages["auth.country"]}
            </Text>

            <ScrollView contentContainerStyle={{ paddingVertical: space.sm }}>
              {COUNTRIES.map((option) => {
                const selected = option.code === country.code;

                return (
                  <Pressable
                    key={option.code}
                    onPress={() => choose(option)}
                    style={({ pressed }) => ({
                      alignItems: "center",
                      /*
                       * Selected is a tint with green text, never a solid neon
                       * fill — the same rule as `ChipRow` and the desk app's
                       * `SELECTED_TINT`.
                       */
                      backgroundColor: selected
                        ? theme.primaryTint
                        : "transparent",
                      flexDirection: "row",
                      gap: space.md,
                      opacity: pressed ? 0.7 : 1,
                      paddingHorizontal: space.lg,
                      paddingVertical: space.md,
                    })}
                  >
                    <Text style={{ fontSize: font.title }}>
                      {flagEmoji(option.code)}
                    </Text>
                    <Text
                      style={{
                        color: selected
                          ? theme.primaryAccent
                          : theme.foreground,
                        flex: 1,
                        fontSize: font.body,
                        fontWeight: selected ? "600" : "400",
                      }}
                    >
                      {option.name}
                    </Text>
                    <Text
                      style={{
                        color: selected
                          ? theme.primaryAccent
                          : theme.mutedForeground,
                        fontSize: font.body,
                      }}
                    >
                      +{option.dialCode}
                    </Text>
                    {selected ? (
                      <Feather
                        color={theme.primaryAccent}
                        name="check"
                        size={16}
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};
