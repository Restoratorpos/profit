import { Spinner } from "@repo/design-system/components/ui/spinner";
import { useAuth } from "@/lib/auth/context";
import { useLocale } from "@/lib/i18n/provider";
import { useGymSettings } from "../api";
import { SettingsView } from "./settings-view";

export const SettingsPage = () => {
  const { locale, messages } = useLocale();
  const { user } = useAuth();
  const settings = useGymSettings();

  if (settings.error) {
    return (
      <p
        className="m-6 rounded-lg border-2 border-destructive/50 bg-destructive/10 px-4 py-3 font-medium text-destructive"
        role="alert"
      >
        {settings.error.message}
      </p>
    );
  }

  /*
   * The whole screen waits on the gym row, unlike the list pages: the gym card
   * is a form seeded from it, and a form that appears empty and then fills in
   * is one an operator can start typing into and lose.
   */
  if (!settings.data) {
    return (
      <output
        aria-label={messages["settings.title"]}
        className="flex flex-1 items-center justify-center py-20"
      >
        <Spinner className="size-8" />
      </output>
    );
  }

  return (
    <SettingsView
      locale={locale}
      messages={messages}
      settings={settings.data}
      user={user}
    />
  );
};
