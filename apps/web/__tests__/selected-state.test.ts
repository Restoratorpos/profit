import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SELECTED_FILL, SELECTED_TINT } from "@repo/design-system/lib/selected";
import { describe, expect, it } from "vitest";

/**
 * Guards the rule that a chosen control keeps its colour under the cursor.
 *
 * The bug this exists for: `Button`'s `outline` variant carries
 * `hover:bg-accent hover:text-accent-foreground`, which are grey and near-white.
 * Layered on a selected option they repainted it on hover — the green payment
 * card in the order composer turned grey-and-white under the cursor, reading as
 * "you are about to deselect this" when nothing of the sort was happening.
 *
 * Asserted against the source because the failure is a paint. Every part of it
 * is a utility class, so nothing typechecks, lints or builds any differently
 * when it comes back.
 */

const featuresDir = join(process.cwd(), "src/features");
const designSystem = join(process.cwd(), "../../packages/design-system");

/**
 * The shape the ad-hoc selected styles used before they were consolidated. Any
 * of them reappearing means a call site went back to hand-rolling it and lost
 * the hover restatement with it.
 *
 * Anchored on `border-primary`, which is what made those a bordered control
 * rather than a surface. The same green tint without it is a banner or a status
 * dot — `bg-primary/10 text-primary-accent` marks the paid notice on an order
 * and the entry direction on a scan, and neither is a thing you can choose.
 */
const AD_HOC_SELECTED = /border-primary bg-primary\/10/;

const RESTATES_HOVER_BG = /hover:bg-/;
const RESTATES_HOVER_TEXT = /hover:text-/;

const featureFiles = readdirSync(featuresDir, {
  recursive: true,
  withFileTypes: true,
})
  .filter((entry) => entry.isFile() && entry.name.endsWith(".tsx"))
  .map((entry) => join(entry.parentPath, entry.name));

describe("selected styles", () => {
  it.each([
    ["SELECTED_FILL", SELECTED_FILL],
    ["SELECTED_TINT", SELECTED_TINT],
  ])("%s restates its own hover colours", (_name, classes) => {
    /*
     * Without these, the variant's hover wins and the selection disappears
     * under the cursor. A selected thing has nowhere further to go, so its
     * hover state is itself.
     */
    expect(classes).toMatch(RESTATES_HOVER_BG);
    expect(classes).toMatch(RESTATES_HOVER_TEXT);
  });

  it("SELECTED_FILL pairs the fill with its own foreground", () => {
    // Never a bare `bg-selected`: the foreground is what keeps the label legible
    // on the green, and the two ship together or not at all.
    expect(SELECTED_FILL).toContain("bg-selected");
    expect(SELECTED_FILL).toContain("text-selected-foreground");
  });

  it("finds feature files to check", () => {
    expect(featureFiles.length).toBeGreaterThan(30);
  });

  it.each(featureFiles)("%s does not hand-roll a selected style", (path) => {
    expect(readFileSync(path, "utf8")).not.toMatch(AD_HOC_SELECTED);
  });
});

describe("theme", () => {
  const css = readFileSync(join(designSystem, "styles/globals.css"), "utf8");

  it("defines the selected pair in every theme block", () => {
    // Three blocks: :root, .dark and .pure-light. A theme missing the pair
    // falls back to the light one and renders white on neon at 1.7:1.
    expect(css.match(/--selected:/g)).toHaveLength(3);
    expect(css.match(/--selected-foreground:/g)).toHaveLength(3);
  });

  it("exposes the pair to Tailwind", () => {
    // Without the @theme mapping, `bg-selected` is not a class and silently
    // does nothing at all.
    expect(css).toContain("--color-selected: var(--selected)");
    expect(css).toContain(
      "--color-selected-foreground: var(--selected-foreground)"
    );
  });
});

describe("sidebar", () => {
  const source = readFileSync(
    join(designSystem, "components/ui/sidebar.tsx"),
    "utf8"
  );

  it("gives the active item a different colour from hover", () => {
    /*
     * It used to be `data-active:bg-sidebar-accent`, the same token as
     * `hover:bg-sidebar-accent` — so hovering any nav item made it look exactly
     * like the page you were on, and there was no way to tell which that was.
     */
    expect(source).toContain("data-active:bg-selected");
    expect(source).not.toContain("data-active:bg-sidebar-accent");
  });

  it("keeps the active item from being repainted on hover", () => {
    expect(source).toContain("data-active:hover:bg-selected");
    expect(source).toContain("data-active:hover:text-selected-foreground");
  });
});
