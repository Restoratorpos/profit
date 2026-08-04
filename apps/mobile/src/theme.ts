/**
 * The colours, lifted from `packages/design-system/styles/globals.css`.
 *
 * They are restated here rather than imported because that file is CSS consumed
 * by Tailwind, and there is no Tailwind in React Native. **When a token changes
 * there, change it here** — a manager looking at the phone and the desk terminal
 * side by side should be looking at one product.
 *
 * `--primary` (#2ee87f) is a fill, not text: it is a 1.7:1 contrast against the
 * dark background, so it goes behind black text or under an icon, never on top
 * of the page as a label. Where the green has to *be read*, use `primaryAccent`.
 */

export interface Theme {
  background: string;
  border: string;
  card: string;

  /** Series colours, in the order the desk learned them. Do not reorder. */
  chart: readonly [string, string, string, string, string];
  dark: boolean;

  destructive: string;
  foreground: string;
  muted: string;
  mutedForeground: string;

  primary: string;
  /** The green as *text*: dark enough to read on a light background. */
  primaryAccent: string;
  primaryForeground: string;
  /** A wash of the primary, for the hero card and selected rows. */
  primaryTint: string;
  /** One step up from `card` — chips and tiles that sit on top of a card. */
  raised: string;
  warning: string;
}

export const darkTheme: Theme = {
  dark: true,

  background: "#141414",
  card: "#1e1e1e",
  raised: "#2a2a2a",
  foreground: "#f5f5f4",
  muted: "#2a2a2a",
  mutedForeground: "#b5b5b3",
  border: "rgba(255,255,255,0.14)",

  primary: "#2ee87f",
  primaryAccent: "#2ee87f",
  primaryForeground: "#04220f",
  primaryTint: "rgba(46,232,127,0.10)",

  destructive: "#d92d20",
  warning: "#eda100",

  chart: ["#3987e5", "#d95926", "#199e70", "#eda100", "#e87ba4"],
};

export const lightTheme: Theme = {
  dark: false,

  background: "#ffffff",
  card: "#ffffff",
  raised: "#f5f5f5",
  foreground: "#0a0a0a",
  muted: "#f5f5f5",
  mutedForeground: "#595959",
  border: "#d4d4d4",

  primary: "#2ee87f",
  primaryAccent: "#0aa352",
  primaryForeground: "#052e16",
  primaryTint: "rgba(10,163,82,0.10)",

  destructive: "#e7000b",
  warning: "#b45309",

  chart: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"],
};

/** Spacing scale. Multiples of 4, same as the Tailwind steps the desk uses. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

export const font = {
  /** Tile figures — the number you read from arm's length. */
  display: 30,
  title: 20,
  body: 15,
  label: 13,
  /** Tile captions. Uppercased and tracked out, so it stays legible small. */
  caption: 11,
} as const;
