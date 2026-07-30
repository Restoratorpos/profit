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
const TSX_FILE = /\.tsx$/;
const PANEL_COMPONENT = /sheet|dialog/;
const CLASS_ATTRIBUTE = /class[nN]ame="[^"]*"/g;
const GROWS_TO_FILL = /\bflex-1\b/;

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

describe("sidebar", () => {
  const source = readFileSync(
    join(
      process.cwd(),
      "../../packages/design-system/components/ui/sidebar.tsx"
    ),
    "utf8"
  );

  it("scrolls the nav when it outgrows a short viewport", () => {
    expect(source).toContain("min-h-0 flex-1 flex-col gap-0 overflow-y-auto");
  });

  it("keeps scrolling while collapsed to icons", () => {
    /*
     * It used to clip both axes there. The intent was only to stop the labels
     * sliding out sideways, but `overflow-hidden` took the vertical scroll with
     * it, so on a short screen the last destinations were unreachable in icon
     * mode — visible in the expanded width and gone in the narrow one.
     */
    expect(source).toContain("group-data-[collapsible=icon]:overflow-x-hidden");
    expect(source).not.toContain(
      "group-data-[collapsible=icon]:overflow-hidden"
    );
  });

  it("anchors the header and footer so the nav is what scrolls", () => {
    // Without `shrink-0` a flex child shrinks by default, so a short viewport
    // squeezed the brand and the footer instead of scrolling between them.
    expect(source).toContain('cn("flex shrink-0 flex-col gap-2 p-2"');
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

/**
 * The same `min-h-0` rule the shell follows, inside every panel.
 *
 * A sheet is a full-height flex column: a header, something that scrolls, and
 * usually a footer carrying the button the panel exists for. `flex-1` alone
 * leaves `min-height: auto`, so the scrolling child cannot shrink below its own
 * content — the column grows past the viewport instead, and the footer is pushed
 * off the bottom of the screen. On a tall display nothing looks wrong; on a 500px
 * laptop the Saqlash and To'lash buttons are simply unreachable, with no
 * scrollbar to explain why.
 */
const panels = readdirSync(join(src, "features"), {
  recursive: true,
  withFileTypes: true,
})
  .filter(
    (entry) =>
      entry.isFile() &&
      TSX_FILE.test(entry.name) &&
      PANEL_COMPONENT.test(entry.name)
  )
  .map((entry) => join(entry.parentPath, entry.name));

describe("panels", () => {
  it("finds sheets and dialogs to check", () => {
    expect(panels.length).toBeGreaterThan(5);
  });

  it.each(panels)("%s can shrink what it scrolls", (path) => {
    const source = readFileSync(path, "utf8");

    for (const className of source.match(CLASS_ATTRIBUTE) ?? []) {
      if (SCROLLS_ITSELF.test(className) && GROWS_TO_FILL.test(className)) {
        expect(className).toContain("min-h-0");
      }
    }
  });
});
