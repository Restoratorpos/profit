import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SELECTED_TINT } from "@repo/design-system/lib/selected";
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

const RESTATES_HOVER_BG = /(?<!dark:)hover:bg-/;
const RESTATES_HOVER_TEXT = /(?<!dark:)hover:text-/;

/**
 * The dark half of the same fight. `outline` carries `dark:bg-input/30` and
 * `dark:hover:bg-input/50`, `ghost` carries `dark:hover:bg-accent/50`, and the
 * `dark` variant compiles to `&:is(.dark *, …)` — `:is()` lends it the
 * specificity of a class, so a `dark:` utility beats a plain one outright
 * rather than merely following it. A tint declared only unprefixed loses to
 * the variant's own dark background and vanishes in every dark theme.
 */
const RESTATES_DARK_BG = /dark:bg-/;
const RESTATES_DARK_HOVER_BG = /dark:hover:bg-/;

const featureFiles = readdirSync(featuresDir, {
  recursive: true,
  withFileTypes: true,
})
  .filter((entry) => entry.isFile() && entry.name.endsWith(".tsx"))
  .map((entry) => join(entry.parentPath, entry.name));

describe("selected styles", () => {
  it("SELECTED_TINT restates its own hover colours", () => {
    /*
     * Without these, the variant's hover wins and the selection disappears
     * under the cursor. A selected thing has nowhere further to go, so its
     * hover state is itself.
     */
    expect(SELECTED_TINT).toMatch(RESTATES_HOVER_BG);
    expect(SELECTED_TINT).toMatch(RESTATES_HOVER_TEXT);
  });

  it("SELECTED_TINT restates its colours for dark themes", () => {
    // A plain `bg-primary/10` loses to the variant's `dark:bg-input/30` on
    // specificity, not order — so the tint has to be declared twice or it is
    // simply absent in the dark.
    expect(SELECTED_TINT).toMatch(RESTATES_DARK_BG);
    expect(SELECTED_TINT).toMatch(RESTATES_DARK_HOVER_BG);
  });

  it("SELECTED_TINT pairs the tint with a foreground that survives it", () => {
    // `--primary` is the neon and is a fill colour; as a label on a 10% wash of
    // itself it reads at 1.7:1. `--primary-accent` is the same green darkened
    // to clear 4.5:1, and it is what the text must use.
    expect(SELECTED_TINT).toContain("bg-primary/10");
    expect(SELECTED_TINT).toContain("text-primary-accent");
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
