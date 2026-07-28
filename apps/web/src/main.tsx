import "@fontsource-variable/inter";
import "./styles.css";

import { DesignSystemProvider } from "@repo/design-system";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/app";
import { LocaleProvider } from "@/lib/i18n/provider";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /*
       * This replaces Next's server-side fetch + revalidatePath. A short stale
       * window is right for a front-desk terminal: two operators work the same
       * data from different machines, so a list that never refetches goes wrong
       * quietly.
       */
      staleTime: 30_000,
      // The API is on the LAN. A request that fails twice is a real failure, not
      // a flaky connection worth hammering.
      retry: 1,
    },
  },
});

const container = document.getElementById("root");

if (!container) {
  throw new Error("#root is missing from index.html");
}

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* DesignSystemProvider passes attribute="class" to next-themes, which is
          what globals.css's `@custom-variant dark (&:is(.dark *))` keys off. */}
      <DesignSystemProvider>
        <LocaleProvider>
          <App />
        </LocaleProvider>
      </DesignSystemProvider>
    </QueryClientProvider>
  </StrictMode>
);
