import { createContext, type ReactNode, useContext, useMemo } from "react";
import { useColorScheme } from "react-native";
import { darkTheme, lightTheme, type Theme } from "./theme";

const ThemeContext = createContext<Theme>(darkTheme);

/**
 * Follows the phone's own setting.
 *
 * There is deliberately no in-app toggle: the desk app has one because a gym
 * terminal is a shared machine with no OS-level preference of its own, whereas a
 * phone already knows what its owner wants and asking twice is a worse answer.
 */
export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const scheme = useColorScheme();
  const theme = useMemo(
    () => (scheme === "light" ? lightTheme : darkTheme),
    [scheme]
  );

  return (
    <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
  );
};

export const useTheme = (): Theme => useContext(ThemeContext);
