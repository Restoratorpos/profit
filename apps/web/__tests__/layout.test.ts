import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards the shell's scrolling contract: the header is fixed, and exactly one
 * element below it scrolls.
 *
 * This is asserted against the source rather than a render because the failure
 * is visual and silent. Every piece of it is a plain utility class — drop
 * `min-h-0` and the overflow quietly relocates to the body, add an
 * `overflow-y-auto` to any page and you get two scrollbars nested inside each
 * other. Neither produces a type error, a lint error, or a failed build, and
 * both look fine until the content is taller than the viewport.
 */

const src = join(process.cwd(), "src");

const PAGE_COMPONENT = /-(view|page|composer)\.tsx$/;
const SCROLLS_ITSELF = /overflow-y-auto|overflow-auto/;
const FILLS_VIEWPORT = /\bh-(screen|svh|full)\b/;

const read = (path: string) => readFileSync(join(src, path), "utf8");

/**
 * Page-level components. Sheets and dialogs are excluded: they are their own
 * overlay with their own bounded height, so they scroll internally by design.
 */
const pageComponents = readdirSync(join(src, "features"), {
  recursive: true,
  withFileTypes: true,
})
  .filter(
    (entry) =>
      entry.isFile() &&
      PAGE_COMPONENT.test(entry.name) &&
      !entry.name.includes("sheet")
  )
  .map((entry) => join(entry.parentPath, entry.name));

describe("app shell", () => {
  const source = read("components/app-layout.tsx");

  it("pins the shell to the viewport so it cannot scroll as a whole", () => {
    // `svh`, not `vh`: phone browser chrome collapses on scroll, and `vh` would
    // leave the header overhanging or a gap under the fold.
    expect(source).toContain("h-svh overflow-hidden");
  });

  it("puts the scroll container below the header, not around it", () => {
    const scrollContainer = "flex min-h-0 flex-1 flex-col overflow-y-auto";

    expect(source).toContain(scrollContainer);

    // The Outlet must sit inside that container and the Topbar outside it —
    // reversed, the header scrolls away with the content.
    const topbarAt = source.indexOf("<Topbar");
    const containerAt = source.indexOf(scrollContainer);

    expect(topbarAt).toBeGreaterThan(-1);
    expect(topbarAt).toBeLessThan(containerAt);
    expect(source.indexOf("<Outlet")).toBeGreaterThan(containerAt);
  });

  it("keeps the header from being squeezed by the content below it", () => {
    // `shrink-0` rather than `sticky`: inside a non-scrolling flex column there
    // is nothing to stick to, and a flex item shrinks by default.
    expect(read("components/topbar.tsx")).toContain("shrink-0");
  });
});

describe("pages", () => {
  it("finds page components to check", () => {
    expect(pageComponents.length).toBeGreaterThan(10);
  });

  it.each(
    pageComponents
  )("%s does not open a second scroll container", (path) => {
    const source = readFileSync(path, "utf8");

    /*
     * A page that scrolls itself competes with the shell's container: the outer
     * one still grows, so you scroll the page to its end and then scroll the
     * shell again to reach the same content.
     */
    expect(source).not.toMatch(SCROLLS_ITSELF);
    expect(source).not.toMatch(FILLS_VIEWPORT);
  });
});
