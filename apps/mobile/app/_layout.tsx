import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { setBackgroundColorAsync } from "expo-system-ui";
import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ApiError } from "@/api/client";
import { AuthProvider } from "@/auth/context";
import { LocaleProvider } from "@/locale-context";
import { ThemeProvider, useTheme } from "@/theme-context";

/**
 * Providers, and nothing else.
 *
 * Note what is **not** here: an `await` before the tree renders. The desk app
 * once restored its session before mounting React, and a request that hung left
 * a permanently blank page with nothing in the log. `AuthProvider` restores
 * behind a status flag instead, and `app/index.tsx` decides where that lands.
 */

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /*
       * A 401 that survived `apiFetch` means the refresh already failed, so the
       * session is gone and retrying is just noise on the way to the sign-in
       * screen. A 4xx generally will not become a 2xx by asking again.
       */
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status < 500) {
          return false;
        }

        return failureCount < 2;
      },
      /*
       * Phones lose wifi walking across a gym. Refetching when the app comes
       * back to the foreground is what makes a figure current when it is looked
       * at rather than when it was fetched — see the AppState wiring below.
       */
      refetchOnWindowFocus: false,
      staleTime: 60_000,
    },
  },
});

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <LocaleProvider>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <ForegroundRefetch />
              <ThemedShell />
            </AuthProvider>
          </QueryClientProvider>
        </LocaleProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/**
 * React Query's `refetchOnWindowFocus` listens for a browser event that does not
 * exist here, so the equivalent is wired by hand: when the app returns from the
 * background, mark everything stale so the visible screen refetches.
 */
/** The two states the OS puts an app in on its way out of the foreground. */
const AWAY: AppStateStatus[] = ["inactive", "background"];

const ForegroundRefetch = () => {
  const previous = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (AWAY.includes(previous.current) && next === "active") {
        queryClient.invalidateQueries();
      }

      previous.current = next;
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return null;
};

const ThemedShell = () => {
  const theme = useTheme();

  /*
   * Paints the window behind React's root view. Without it the OS background
   * shows through for a frame during navigation and while the keyboard animates
   * — a white flash in a dark app.
   */
  useEffect(() => {
    setBackgroundColorAsync(theme.background).catch(() => undefined);
  }, [theme.background]);

  return (
    <>
      <StatusBar style={theme.dark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: theme.background },
          headerShown: false,
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="profile"
          options={{ animation: "slide_from_bottom", presentation: "modal" }}
        />
      </Stack>
    </>
  );
};
