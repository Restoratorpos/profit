import { v4 } from "uuid";

// Define a type for the generated ID objects
interface UniqueIdObject {
  id: string;
}

// Define a type alias for the function return type
type GenerateUniqueIds = UniqueIdObject[];

/**
 * Generates an array of objects with unique IDs.
 *
 * @param times - The number of unique ID objects to generate.
 * @param label - An optional prefix label for the unique IDs.
 * @returns An array of objects, each containing a unique ID.
 */
const generateUniqueIds = (times: number): GenerateUniqueIds => {
  return Array.from({ length: times }).map(() => ({ id: v4() }));
};

const deduplicateById = <T extends { id: string }>(array: T[]): T[] => {
  const seen = new Set<string>();
  return array.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
};

const normalizeEmails = (emails: (string | undefined)[]) => {
  const seen = new Set<string>();
  return emails
    .map((e) => (e ?? "").trim().toLowerCase())
    .filter(Boolean)
    .filter((e) => {
      if (seen.has(e)) {
        return false;
      }
      seen.add(e);
      return true;
    });
};

// function stringToColor(input: string): string {
//   let hash = 0;

//   for (let i = 0; i < input.length; i++) {
//     hash = input.charCodeAt(i) + ((hash << 5) - hash);
//   }

//   let color = "#";

//   for (let i = 0; i < 3; i++) {
//     const value = (hash >> (i * 8)) & 0xff;
//     color += value.toString(16).padStart(2, "0");
//   }

//   return color;
// }

// Convert HSL → HEX
function hslToHex(h: number, s: number, l: number) {
  s /= 100;
  l /= 100;

  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));

  return (
    "#" +
    [f(0), f(8), f(4)]
      .map((x) =>
        Math.round(x * 255)
          .toString(16)
          .padStart(2, "0")
      )
      .join("")
  );
}

// LAB distance to avoid similarity
function colorDistance(a: string, b: string) {
  const rgbToLab = (hex: string) => {
    const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
    const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
    const b = Number.parseInt(hex.slice(5, 7), 16) / 255;

    const srgb = [r, g, b].map((v) =>
      v > 0.040_45 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92
    );

    const [x, y, z] = [
      srgb[0] * 0.4124 + srgb[1] * 0.3576 + srgb[2] * 0.1805,
      srgb[0] * 0.2126 + srgb[1] * 0.7152 + srgb[2] * 0.0722,
      srgb[0] * 0.0193 + srgb[1] * 0.1192 + srgb[2] * 0.9505,
    ];

    const xyz = [x, y, z].map((v) =>
      v > 0.008_856 ? v ** (1 / 3) : 7.787 * v + 16 / 116
    );

    return {
      L: 116 * xyz[1] - 16,
      a: 500 * (xyz[0] - xyz[1]),
      b: 200 * (xyz[1] - xyz[2]),
    };
  };

  const A = rgbToLab(a);
  const B = rgbToLab(b);
  return Math.sqrt((A.L - B.L) ** 2 + (A.a - B.a) ** 2 + (A.b - B.b) ** 2);
}

function stringToColor(
  input: string,
  bannedColors: string[] = [],
  minDistance = 25 // LAB distance threshold
) {
  // Hash string → number
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = input.charCodeAt(i) + ((hash << 5) - hash);
  }

  // Hash → HSL
  let hue = Math.abs(hash) % 360;

  // 🚫 Avoid poo-ish colors (hue 20–50)
  if (hue >= 20 && hue <= 50) {
    hue = (hue + 80) % 360; // shift to safe zone
  }

  const saturation = 65; // good colorfulness
  const lightness = 55; // good visibility

  let hex = hslToHex(hue, saturation, lightness);

  // 🚫 Avoid similarity to banned/existing colors
  for (const bad of bannedColors) {
    if (colorDistance(hex, bad) < minDistance) {
      hue = (hue + 60) % 360; // rotate to new color
      hex = hslToHex(hue, saturation, lightness);
    }
  }

  return hex;
}

export { deduplicateById, generateUniqueIds, normalizeEmails, stringToColor };
