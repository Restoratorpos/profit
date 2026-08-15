import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards against the router plugin silently replacing a real route with its
 * scaffold.
 *
 * `@tanstack/router-plugin` writes a stub for any route file it finds missing
 * or empty. Shell redirection (`cat > file`) truncates before writing, and if
 * the dev server is running its watcher can see that empty moment and scaffold
 * over the file mid-write. Five routes were lost that way — /members, /orders,
 * /products, /inventory and /transactions all silently reverted to
 * `Hello "/_authed/..."!`.
 *
 * Nothing else catches it: a scaffold is valid TypeScript and builds cleanly,
 * so typecheck, lint and the production build all pass. It only shows up by
 * opening the page. Hence this.
 */

/*
 * From cwd rather than import.meta.url: the jsdom environment rewrites
 * import.meta.url to a non-file scheme, so fileURLToPath throws. Vitest runs
 * with cwd set to the workspace root (apps/web).
 */
const routesDir = join(process.cwd(), "src/routes/_authed");

/**
 * Routes that legitimately name no feature.
 *
 * Empty, and it should stay that way: every vertical is ported, the dashboard
 * included. It is kept rather than deleted so a route that genuinely cannot name
 * a feature has somewhere to be declared — and so that adding one is a visible
 * decision rather than a weakened assertion.
 */
const NOT_YET_PORTED = new Set<string>();

const routeFiles = readdirSync(routesDir).filter((name) =>
  name.endsWith(".tsx")
);

/**
 * The unauthenticated routes live one level up, alongside `__root` and
 * `_authed`. They carry exactly the same clobbering risk, so they are checked
 * for the scaffold too — just not for naming a feature, since sign-in and
 * sign-up belong to `lib/auth` rather than to any vertical.
 */
const rootRouteFiles = readdirSync(join(process.cwd(), "src/routes")).filter(
  (name) => name.endsWith(".tsx") && !name.startsWith("_")
);

describe("route files", () => {
  it("finds route files to check", () => {
    // A glob that silently matches nothing would make every assertion vacuous.
    expect(routeFiles.length).toBeGreaterThan(10);
  });

  it.each(routeFiles)("%s is not the plugin's scaffold", (name) => {
    const source = readFileSync(`${routesDir}/${name}`, "utf8");

    expect(source).not.toContain("function RouteComponent");
    expect(source).not.toContain('Hello "/_authed');
  });

  it.each(
    routeFiles.filter((name) => !NOT_YET_PORTED.has(name))
  )("%s renders a real page", (name) => {
    const source = readFileSync(`${routesDir}/${name}`, "utf8");

    // A ported route names a feature component; it never renders a Placeholder.
    expect(source).toContain("@/features/");
    expect(source).not.toContain("Placeholder");
  });
});

describe("unauthenticated route files", () => {
  it("finds sign-in and sign-up", () => {
    expect(rootRouteFiles).toContain("sign-in.tsx");
    expect(rootRouteFiles).toContain("sign-up.tsx");
  });

  it.each(rootRouteFiles)("%s is not the plugin's scaffold", (name) => {
    const source = readFileSync(
      join(process.cwd(), "src/routes", name),
      "utf8"
    );

    expect(source).not.toContain("function RouteComponent");
    expect(source).not.toContain('Hello "/');
  });
});
