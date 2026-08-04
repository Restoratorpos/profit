import { formatPhone } from "@repo/auth/lib/countries";
import {
  Avatar,
  AvatarFallback,
} from "@repo/design-system/components/ui/avatar";
import { Card, CardContent } from "@repo/design-system/components/ui/card";
import { UserRoundIcon } from "lucide-react";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import type { AuthUser } from "@/lib/auth/session";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/dictionary";
import type { GymSettings } from "../types";
import { GymSection } from "./gym-section";
import { PasswordSection } from "./password-section";

interface SettingsViewProperties {
  locale: Locale;
  messages: Messages;
  settings: GymSettings;
  user: AuthUser | null;
}

/** Renaming the gym and its hours is the owner's and the admin's. */
const CAN_EDIT_GYM = new Set(["owner", "admin"]);

export const SettingsView = ({
  locale,
  messages,
  settings,
  user,
}: SettingsViewProperties) => (
  <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">
          {messages["settings.title"]}
        </h1>
        <p className="text-muted-foreground text-sm">
          {messages["settings.subtitle"]}
        </p>
      </div>

      {/*
       * The two device preferences, in the compact controls they have always
       * been — they left the topbar, not the app. They belong beside the title
       * rather than in a card of their own: a theme is a thing you flick and
       * see the result of immediately, so it wants to be one press away rather
       * than a labelled section competing with the gym's opening hours.
       */}
      <div className="flex shrink-0 items-center gap-2">
        <LanguageSwitcher locale={locale} messages={messages} />
        <ThemeSwitcher messages={messages} />
      </div>
    </div>

    {/*
     * Two columns from `lg` up, and `items-start` so a short card does not
     * stretch to the height of a tall one beside it. The cards themselves fill
     * the page; the fields inside them stay a readable width because the column
     * is half of it rather than all of it.
     */}
    <div className="grid w-full items-start gap-4 lg:grid-cols-2">
      {/*
       * Who is signed in, with their number. Full width above the forms: it is
       * one line of text and is what the screen answers first.
       */}
      <Card className="lg:col-span-2">
        <CardContent className="flex items-center gap-3">
          {/* The same person mark the topbar wears, so the account reads as one
              thing in both places. */}
          <Avatar className="size-11">
            <AvatarFallback className="bg-primary/15 text-primary-accent">
              <UserRoundIcon className="size-5" />
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate font-medium">{user?.name}</span>
            <span className="truncate text-muted-foreground text-sm">
              {formatPhone(user?.phone)}
            </span>
          </div>
        </CardContent>
      </Card>

      <GymSection
        canEdit={CAN_EDIT_GYM.has(user?.role ?? "")}
        messages={messages}
        settings={settings}
      />

      <PasswordSection messages={messages} />
    </div>
  </div>
);
