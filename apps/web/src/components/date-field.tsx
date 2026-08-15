import type { DatePickerProperties } from "@repo/design-system/components/ui/date-picker";
import { DatePicker } from "@repo/design-system/components/ui/date-picker";
import {
  type Locale as CalendarLocale,
  enUS,
  ru,
  uz,
} from "@repo/design-system/lib/calendar-locales";
import type { Locale as AppLocale } from "@/lib/i18n/config";
import { useLocale } from "@/lib/i18n/provider";

/**
 * Which date-fns locale each of the app's three languages calendars in.
 *
 * Typed as a total record, so adding a language to `LOCALES` without giving it a
 * calendar is a compile error rather than a month grid that silently reverts to
 * English.
 */
const CALENDAR_LOCALES: Record<AppLocale, CalendarLocale> = {
  en: enUS,
  ru,
  uz,
};

/**
 * The date field every screen uses: the design system's picker, calendared in the
 * language the operator chose.
 *
 * A wrapper rather than a prop threaded through every call site. There are six
 * screens with a date on them, and "pass the locale" is the kind of argument that
 * gets forgotten on the seventh — leaving one calendar in English with no
 * indication anything is wrong. The design system stays app-agnostic; knowing
 * about `useLocale` is this app's business.
 *
 * Everything else is the picker's own surface, forwarded untouched: the wire
 * format stays `yyyy-MM-dd`, so nothing about what a form submits changes.
 */
export const DateField = (props: DatePickerProperties) => {
  const { locale } = useLocale();

  return <DatePicker {...props} locale={CALENDAR_LOCALES[locale]} />;
};
