import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Deliberately does not load vite.config.ts: the TanStack Router plugin
 * regenerates routeTree.gen.ts on start, which a test run has no business doing.
 * Tests import modules directly rather than through the route tree.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@repo": fileURLToPath(new URL("../../packages", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
  },
});
