import "@fontsource-variable/inter";
import "./styles.css";

import { DesignSystemProvider } from "@repo/design-system";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { restoreSession } from "@/lib/auth/api";
import { AuthProvider, useAuth } from "@/lib/auth/context";
import type { AuthUser } from "@/lib/auth/session";
import { LocaleProvider } from "@/lib/i18n/provider";
import { persister, queryClient } from "@/lib/query-client";
import { router } from "@/router";

/**
 * Feeds the live auth state into the router's context.
 *
 * Route guards run in `beforeLoad`, outside React, so they cannot call a hook —
 * they read `context.auth` instead. Re-rendering RouterProvider with a new
 * context is what makes signing in or out re-evaluate the guards immediately.
 */
const RoutedApp = () => {
  const auth = useAuth();

  return <RouterProvider context={{ auth }} router={router} />;
};

const App = ({ initialUser }: { initialUser: AuthUser | null }) => (
  <StrictMode>
    {/* DesignSystemProvider passes attribute="class" to next-themes, which is
        what globals.css's `@custom-variant dark (&:is(.dark *))` keys off. */}
    <DesignSystemProvider>
      <LocaleProvider>
        <AuthProvider initialUser={initialUser}>
          <PersistQueryClientProvider
            client={queryClient}
            persistOptions={{
              persister,
              // Restoring another operator's cache on a shared terminal would be
              // a data leak, so the persisted cache is scoped to who it belongs
              // to. A different id discards it rather than adopting it.
              buster: initialUser?.id ?? "anonymous",
              maxAge: 24 * 60 * 60 * 1000,
            }}
          >
            <RoutedApp />
          </PersistQueryClientProvider>
        </AuthProvider>
      </LocaleProvider>
    </DesignSystemProvider>
  </StrictMode>
);

const container = document.getElementById("root");

if (!container) {
  throw new Error("#root is missing from index.html");
}

/*
 * Ask for a session before the first render.
 *
 * The access token lives in memory and is gone after a reload, but the refresh
 * cookie is not — so the app trades one request at boot for knowing whether it
 * is signed in. Rendering first and correcting afterwards would flash the
 * sign-in screen at every already-signed-in operator, on every reload.
 */
const session = await restoreSession();

createRoot(container).render(<App initialUser={session?.user ?? null} />);
