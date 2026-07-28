// ── Hex ↔ OKLCH color conversion + custom theme palette generation ──
// Pure math, zero dependencies. Uses the sRGB → linear RGB → XYZ D65 → OKLab → OKLCH pipeline.

interface Oklch {
  c: number;
  h: number;
  l: number;
}

interface CustomThemeConfig {
  accentColor: string;
  backgroundColor: string;
  contrast: number; // 0–100
}

// ── sRGB helpers ────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = Number.parseInt(h, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// sRGB → linear
function linearize(c: number): number {
  const s = c / 255;
  return s <= 0.040_45 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

// linear → sRGB
function delinearize(c: number): number {
  const s = c <= 0.003_130_8 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
  return s * 255;
}

// ── Linear RGB ↔ OKLab ─────────────────────────────────────────────────

function linearRgbToOklab(
  r: number,
  g: number,
  b: number
): [number, number, number] {
  const l_ = 0.412_221_470_8 * r + 0.536_332_536_3 * g + 0.051_445_992_9 * b;
  const m_ = 0.211_903_498_2 * r + 0.680_699_545_1 * g + 0.107_396_956_6 * b;
  const s_ = 0.088_302_461_9 * r + 0.281_718_837_6 * g + 0.629_978_700_5 * b;

  const l = Math.cbrt(l_);
  const m = Math.cbrt(m_);
  const s = Math.cbrt(s_);

  return [
    0.210_454_255_3 * l + 0.793_617_785 * m - 0.004_072_046_8 * s,
    1.977_998_495_1 * l - 2.428_592_205 * m + 0.450_593_709_9 * s,
    0.025_904_037_1 * l + 0.782_771_766_2 * m - 0.808_675_766 * s,
  ];
}

function oklabToLinearRgb(
  L: number,
  a: number,
  b: number
): [number, number, number] {
  const l = (L + 0.396_337_777_4 * a + 0.215_803_757_3 * b) ** 3;
  const m = (L - 0.105_561_345_8 * a - 0.063_854_172_8 * b) ** 3;
  const s = (L - 0.089_484_177_5 * a - 0.131_402_022_6 * b) ** 3;

  return [
    4.076_741_662_1 * l - 3.307_711_591_3 * m + 0.230_969_929_2 * s,
    -1.268_438_004_6 * l + 2.609_757_401_1 * m - 0.341_319_396_5 * s,
    -0.004_196_086_3 * l - 0.703_418_614_7 * m + 1.707_614_701 * s,
  ];
}

// ── OKLCH ↔ OKLab ──────────────────────────────────────────────────────

function oklabToOklch(L: number, a: number, b: number): Oklch {
  const c = Math.sqrt(a * a + b * b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) {
    h += 360;
  }
  return { l: L, c, h };
}

function oklchToOklab(lch: Oklch): [number, number, number] {
  const rad = (lch.h * Math.PI) / 180;
  return [lch.l, lch.c * Math.cos(rad), lch.c * Math.sin(rad)];
}

// ── Public API: hex ↔ OKLCH ─────────────────────────────────────────────

function hexToOklch(hex: string): Oklch {
  const [r, g, b] = hexToRgb(hex);
  const [lr, lg, lb] = [linearize(r), linearize(g), linearize(b)];
  const [L, a, bVal] = linearRgbToOklab(lr, lg, lb);
  return oklabToOklch(L, a, bVal);
}

function oklchToHex(lch: Oklch): string {
  const [L, a, b] = oklchToOklab(lch);
  const [lr, lg, lb] = oklabToLinearRgb(L, a, b);
  return rgbToHex(delinearize(lr), delinearize(lg), delinearize(lb));
}

function formatOklch(lch: Oklch): string {
  return `oklch(${lch.l.toFixed(3)} ${lch.c.toFixed(3)} ${lch.h.toFixed(1)})`;
}

// ── Palette generation ──────────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function blendWhiteOver(bg: Oklch, alpha: number): Oklch {
  return {
    l: bg.l + (1 - bg.l) * alpha,
    c: bg.c * (1 - alpha),
    h: bg.h,
  };
}

function generateCustomThemeVars(
  config: CustomThemeConfig
): Record<string, string> {
  const bg = hexToOklch(config.backgroundColor);
  const accent = hexToOklch(config.accentColor);
  const isDark = bg.l < 0.5;

  // Contrast factor: 0–100 → 0.3–1.0 multiplier for surface offsets
  const cf = lerp(0.3, 1.0, config.contrast / 100);

  // Foreground: high contrast from background
  const fgL = isDark ? lerp(0.85, 0.985, cf) : lerp(0.25, 0.145, cf);
  const fg: Oklch = { l: fgL, c: 0, h: 0 };

  // Surface offset direction: lighter for dark themes, darker for light themes
  const dir = isDark ? 1 : -1;

  // Derived surfaces with small lightness offsets scaled by contrast
  const cardL = bg.l + dir * 0.06 * cf;
  const popoverL = bg.l + dir * 0.055 * cf;
  const mutedL = bg.l + dir * 0.12 * cf;
  const secondaryL = bg.l + dir * 0.12 * cf;
  const accentSurfaceL = bg.l + dir * 0.22 * cf;
  const sidebarL = bg.l + dir * 0.04 * cf;
  const sidebarAccentL = bg.l + dir * 0.12 * cf;

  // Muted foreground: between fg and bg
  const mutedFgL = isDark ? lerp(0.55, 0.708, cf) : lerp(0.65, 0.556, cf);

  // Border & input: subtle separation
  const borderAlphaFraction = lerp(0.08, 0.12, cf);
  const borderL = bg.l - 0.078 * cf;
  const inputAlphaFraction = lerp(0.1, 0.15, cf);

  // Primary foreground: white or near-black depending on accent lightness
  const primaryFgL = accent.l < 0.6 ? 0.985 : 0.145;

  const vars: Record<string, string> = {
    "--background": formatOklch(bg),
    "--foreground": formatOklch(fg),
    "--card": formatOklch({ l: cardL, c: bg.c, h: bg.h }),
    "--card-foreground": formatOklch(fg),
    "--popover": formatOklch({ l: popoverL, c: bg.c, h: bg.h }),
    "--popover-foreground": formatOklch(fg),
    "--primary": formatOklch(accent),
    "--primary-foreground": formatOklch({ l: primaryFgL, c: 0, h: 0 }),
    "--secondary": formatOklch({ l: secondaryL, c: bg.c, h: bg.h }),
    "--secondary-foreground": formatOklch(fg),
    "--muted": formatOklch({ l: mutedL, c: bg.c, h: bg.h }),
    "--muted-foreground": formatOklch({ l: mutedFgL, c: 0, h: 0 }),
    "--accent": formatOklch({ l: accentSurfaceL, c: bg.c, h: bg.h }),
    "--accent-foreground": formatOklch(fg),
    "--destructive": "oklch(0.704 0.191 22.216)",
    "--destructive-foreground": formatOklch({ l: 0.985, c: 0, h: 0 }),
    "--border": isDark
      ? formatOklch(blendWhiteOver(bg, borderAlphaFraction))
      : formatOklch({ l: borderL, c: 0, h: 0 }),
    "--input": isDark
      ? formatOklch(blendWhiteOver(bg, inputAlphaFraction))
      : formatOklch({ l: borderL - 0.01, c: 0, h: 0 }),
    "--ring": formatOklch(accent),
    "--sidebar": formatOklch({ l: sidebarL, c: bg.c, h: bg.h }),
    "--sidebar-foreground": formatOklch(fg),
    "--sidebar-primary": formatOklch(accent),
    "--sidebar-primary-foreground": formatOklch({
      l: primaryFgL,
      c: 0,
      h: 0,
    }),
    "--sidebar-accent": formatOklch({ l: sidebarAccentL, c: bg.c, h: bg.h }),
    "--sidebar-accent-foreground": formatOklch(fg),
    "--sidebar-border": isDark
      ? formatOklch(
          blendWhiteOver({ l: sidebarL, c: bg.c, h: bg.h }, borderAlphaFraction)
        )
      : formatOklch({ l: borderL, c: 0, h: 0 }),
    "--sidebar-ring": formatOklch({
      l: isDark ? 0.439 : accent.l,
      c: isDark ? 0 : accent.c,
      h: isDark ? 0 : accent.h,
    }),
  };

  return vars;
}

export type { CustomThemeConfig, Oklch };
export { generateCustomThemeVars, hexToOklch, oklchToHex };
