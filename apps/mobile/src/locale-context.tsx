import { getItemAsync, setItemAsync } from "expo-secure-store";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  deviceLocale,
  isLocale,
  type Locale,
  type Messages,
  messagesFor,
} from "./i18n";

/**
 * The chosen language, remembered across launches.
 *
 * Stored in SecureStore rather than adding AsyncStorage for one string — this
 * app already depends on the former for the refresh token, and a second storage
 * dependency for a two-letter preference is not worth the install size.
 */

const LOCALE_KEY = "profit.locale";

interface LocaleValue {
  locale: Locale;
  messages: Messages;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleValue | null>(null);

export const LocaleProvider = ({ children }: { children: ReactNode }) => {
  /*
   * Starts on the phone's language so the first frame is already right, then
   * a stored choice overrides it once read. Waiting for storage before the
   * first render would mean a blank frame to save one repaint of the tab bar.
   */
  const [locale, setLocaleState] = useState<Locale>(deviceLocale);

  useEffect(() => {
    let cancelled = false;

    getItemAsync(LOCALE_KEY)
      .then((stored: string | null) => {
        if (!cancelled && isLocale(stored ?? undefined)) {
          setLocaleState(stored as Locale);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    setItemAsync(LOCALE_KEY, next).catch(() => undefined);
  }, []);

  const value = useMemo<LocaleValue>(
    () => ({ locale, messages: messagesFor(locale), setLocale }),
    [locale, setLocale]
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
};

export const useLocale = (): LocaleValue => {
  const value = useContext(LocaleContext);

  if (!value) {
    throw new Error("useLocale must be used inside a LocaleProvider");
  }

  return value;
};

/** Shorthand for the common case — a screen that only reads strings. */
export const useMessages = (): Messages => useLocale().messages;
