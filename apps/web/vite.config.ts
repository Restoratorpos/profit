import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const src = fileURLToPath(new URL("./src", import.meta.url));
const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));
const packagesRoot = fileURLToPath(new URL("../../packages", import.meta.url));

export default defineConfig(({ mode }) => {
  /*
   * This config runs before Vite loads .env files, so `process.env.VITE_*` is
   * empty here no matter what .env.local says — reading it directly would make
   * the file look wired up while silently doing nothing. loadEnv is what
   * actually reads it.
   */
  const env = loadEnv(mode, fileURLToPath(new URL(".", import.meta.url)), "");

  return {
    plugins: [
      /*
       * Must come before the React plugin — it generates routeTree.gen.ts from
       * src/routes and rewrites route modules for code splitting, and React's
       * transform has to run on the result.
       *
       * autoCodeSplitting is what keeps the bundle honest as the nine feature
       * verticals land: each route's component is its own chunk instead of
       * everything landing in one file.
       */
      tanstackRouter({ target: "react", autoCodeSplitting: true }),
      react(),
      tailwindcss(),
    ],

    resolve: {
      alias: [
        /*
         * Mirrors tsconfig's `"@repo/*": ["../../packages/*"]`, and it is load
         * bearing rather than a convenience.
         *
         * @repo/design-system's own files import each other by package name
         * ("@repo/design-system/lib/utils"), but the package declares no
         * dependency on itself, so pnpm never links it into its own
         * node_modules. Dev papers over this — Vite resolves bare imports from
         * this app's node_modules whatever the importer — while Rollup resolves
         * relative to the importing file and fails the build. Aliasing by path
         * makes both agree.
         */
        { find: /^@repo\//, replacement: `${packagesRoot}/` },
        { find: /^@\//, replacement: `${src}/` },
      ],
    },

    server: {
      port: 3001,
      /*
       * Fail instead of quietly moving to the next free port.
       *
       * Vite's default is to hop to 3002, 3003, … when 3001 is taken, print the
       * new URL, and carry on. On a machine where an old dev server is still
       * running that is actively misleading: you open :3001, get the *stale*
       * server, and spend an afternoon wondering why your changes have no
       * effect. Better to refuse to start and say the port is busy.
       */
      strictPort: true,
      /*
       * @repo/design-system is a source-only package: pnpm symlinks it into
       * node_modules and Vite resolves through the link to packages/design-system,
       * which is outside this app's root. Without this, every component import
       * 403s in dev.
       */
      fs: { allow: [workspaceRoot] },

      proxy: {
        /*
         * Dev-only. The browser talks to /api on this origin and Vite forwards to
         * the Hono backend, so cookies stay first-party and there is no CORS
         * preflight in development. In production the SPA is served from the same
         * origin as the API, or CORS_ORIGINS on the backend names this one.
         */
        "/api": {
          target: env.VITE_API_PROXY_TARGET || "http://localhost:7090",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    },

    optimizeDeps: {
      // Linked workspace packages must not be pre-bundled — they are source, and
      // pre-bundling them freezes a stale copy that ignores edits.
      exclude: ["@repo/design-system"],
    },
  };
});
