import "@fontsource-variable/inter";
import "./styles.css";

import { DesignSystemProvider } from "@repo/design-system";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BootScreen, OfflineScreen } from "@/components/boot-screen";
import { AuthProvider, useAuth } from "@/lib/auth/context";
import { LocaleProvider } from "@/lib/i18n/provider";
import { cacheBuster, persister, queryClient } from "@/lib/query-client";
import { router } from "@/router";

/**
 * Feeds the live auth state into the router's context.
 *
 * Route guards run in `beforeLoad`, outside React, so they cannot call a hook —
 * they read `context.auth` instead. Re-rendering RouterProvider with a new
 * context is what makes signing in or out re-evaluate the guards immediately.
 *
 * Nothing is routed until the boot session check has answered. Rendering the
 * router first would run the `_authed` guard against `isAuthenticated: false`
 * and bounce an already-signed-in operator to the sign-in screen, only to
 * redirect them back a moment later.
 */
const RoutedApp = () => {
  const auth = useAuth();

  if (auth.isRestoring) {
    return <BootScreen />;
  }

  /*
   * Routing without a verdict is worse than not routing: the `_authed` guard
   * reads `isAuthenticated`, which is false purely because nobody answered, and
   * would redirect a signed-in operator to sign-in.
   */
  if (auth.isOffline) {
    return <OfflineScreen onRetry={auth.retryRestore} />;
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        /*
         * Two things can make a stored cache the wrong one to restore, and both
         * belong here.
         *
         * **Who it belongs to.** A front desk is a shared machine: restoring
         * the previous operator's cached members for the next one would be a
         * data leak, so a different id discards the cache rather than adopting
         * it.
         *
         * **What shape it is in.** The cache is painted before anything
         * refetches, so without a version a reload after a deploy feeds last
         * week's JSON to this week's components — see `CACHE_SCHEMA_VERSION`.
         */
        buster: cacheBuster(auth.user?.id),
        maxAge: 24 * 60 * 60 * 1000,
      }}
    >
      <RouterProvider context={{ auth }} router={router} />
    </PersistQueryClientProvider>
  );
};

const container = document.getElementById("root");

if (!container) {
  throw new Error("#root is missing from index.html");
}

/*
 * Rendered immediately — deliberately no top-level await here.
 *
 * The session used to be restored before this call. A request that hung (a dev
 * proxy pointing at a backend that is not listening holds the connection rather
 * than refusing it) therefore meant React never mounted: a blank page, a tab
 * that span forever, and no error anywhere to explain it. The restore now
 * happens inside AuthProvider, so the shell always paints.
 */
createRoot(container).render(
  <StrictMode>
    {/* DesignSystemProvider passes attribute="class" to next-themes, which is
        what globals.css's `@custom-variant dark (&:is(.dark *))` keys off. */}
    <DesignSystemProvider>
      <LocaleProvider>
        <AuthProvider>
          <RoutedApp />
        </AuthProvider>
      </LocaleProvider>
    </DesignSystemProvider>
  </StrictMode>
);
