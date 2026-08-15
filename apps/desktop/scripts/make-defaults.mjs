/**
 * Bakes this repo's backend settings into the build as first-run defaults.
 *
 * Run at build time. It reads the backend's local environment file and writes
 * the handful of values a till needs into `dist/defaults.json`, which ships
 * inside the app. A fresh install then starts working with nothing typed.
 *
 * **These are not secret once shipped.** The archive they travel in is trivially
 * unpacked, so anybody holding the installer can read the database password —
 * and that database is shared by every gym. This is the right trade for an
 * installer handed to your own tills, and the wrong one for anything downloadable.
 * The setup form still exists for builds made without an environment file.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, "..", "..", "backend", ".env.local");
const target = join(here, "..", "dist", "defaults.json");

/** Only what the desk app passes to its server — not the whole environment. */
const WANTED = [
  "DB_HOST",
  "DB_NAME",
  "DB_PASSWORD",
  "DB_PORT",
  "DB_USER",
  "DEVICE_GYM_ID",
  "DEVICE_SECRET",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "REDIS_URL",
];

const defaults = {};

if (existsSync(source)) {
  for (const line of readFileSync(source, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();

    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }

    const at = trimmed.indexOf("=");

    if (at === -1) {
      continue;
    }

    const key = trimmed.slice(0, at).trim();

    if (WANTED.includes(key)) {
      // Quotes are part of the file's syntax, not of the value.
      defaults[key] = trimmed
        .slice(at + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
    }
  }
}

mkdirSync(dirname(target), { recursive: true });
// No BOM: this is read with JSON.parse, which refuses one.
writeFileSync(target, `${JSON.stringify(defaults, null, 2)}\n`, "utf8");

const found = Object.keys(defaults).length;

process.stdout.write(
  found === 0
    ? "make-defaults: no environment file found — the app will ask on first run\n"
    : `make-defaults: baked ${found} settings into dist/defaults.json\n`
);
