import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useMemo,
  useState,
} from "react";
import type { Locale } from "./config";
import { getMessages, type Messages } from "./dictionary";
import { getLocale, setLocale as persistLocale } from "./locale";

interface LocaleContextValue {
  locale: Locale;
  messages: Messages;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

/**
 * Holds the locale for the session.
 *
 * The Next app re-read the cookie on the server and called `router.refresh()`
 * to swap languages. There is no server to ask here, so the locale lives in
 * state and the cookie is only how it survives a reload — which also makes the
 * switch instant instead of a round trip.
 */
export const LocaleProvider = ({ children }: { children: ReactNode }) => {
  // Lazy: reads document.cookie, which should happen once, not every render.
  const [locale, setLocaleState] = useState<Locale>(getLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    persistLocale(next);
  }, []);

  const value = useMemo(
    () => ({ locale, messages: getMessages(locale), setLocale }),
    [locale, setLocale]
  );

  return <LocaleContext value={value}>{children}</LocaleContext>;
};

export const useLocale = (): LocaleContextValue => {
  const value = use(LocaleContext);

  if (!value) {
    throw new Error("useLocale must be used inside <LocaleProvider>");
  }

  return value;
};
