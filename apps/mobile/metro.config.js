// Learn more: https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

/*
 * `__dirname`, not `import.meta.dirname`. Metro loads this file with `require`,
 * so it is CommonJS, where `import.meta` is a syntax error — the rule assumes an
 * ES module and is simply wrong about this file.
 */
// biome-ignore lint/correctness/noGlobalDirnameFilename: this file is CommonJS
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

/*
 * This repo installs with pnpm, which keeps a strict, symlinked node_modules
 * rather than hoisting everything to the root. Metro has to be told about both
 * of those facts or it resolves nothing outside apps/mobile.
 *
 * `watchFolders` puts the whole workspace under the file watcher, so a change
 * in a shared package triggers a rebuild. It **appends** rather than replaces:
 * `getDefaultConfig` already put entries there, and overwriting them is what
 * `expo-doctor` flags as "does not contain all entries from Expo's defaults".
 */
config.watchFolders = [...(config.watchFolders ?? []), workspaceRoot];

/*
 * Where to look for a module, in order. pnpm puts an app's real dependencies in
 * its own node_modules (as symlinks into the store) and leaves the root one
 * holding only what the workspace root itself declares — so both are needed.
 */
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

/*
 * Hierarchical lookup stays **on**, which is the opposite of what Expo's
 * monorepo guide says — and the guide is right for npm and yarn, where
 * everything is hoisted to the root and the upward walk only ever finds
 * duplicates.
 *
 * pnpm is built the other way round. A package's own dependencies live in a
 * `node_modules` directory beside it inside `.pnpm/`, and walking up from the
 * importing file is the *only* way to reach them. Turning the walk off means
 * every transitive dependency has to be declared here as a direct one — which
 * failed first on `@expo/metro-runtime`, then on `whatwg-fetch` underneath it,
 * and would have kept going.
 *
 * Symlink following is likewise left at its default (on) rather than set here —
 * pinning it is what `expo-doctor` reports as an unnecessary override.
 */

module.exports = config;
