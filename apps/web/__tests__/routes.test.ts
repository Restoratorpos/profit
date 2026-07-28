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

/** Routes still legitimately showing a Placeholder, pending their port. */
const NOT_YET_PORTED = new Set([
  "devices.tsx",
  // The dashboard renders nothing by design in apps/app too — not pending.
  "index.tsx",
]);

const routeFiles = readdirSync(routesDir).filter((name) =>
  name.endsWith(".tsx")
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
