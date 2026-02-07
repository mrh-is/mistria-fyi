/**
 * Resolves localization keys in the parsed fiddle data to English strings.
 *
 * The fiddle has self-referencing string values like:
 *   { name: "npcs/holt/name" }  (where value === the original slash-key path)
 *
 * The localization file (localization.json) maps these to English:
 *   { eng: { "npcs/holt/name": "Holt", ... } }
 *
 * Fallback chain: same-version localization → previous version (semver) → snake_case→Title Case
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { FiddleData } from "./parse-fiddle.js";

interface LocalizationPack {
  eng: Record<string, string>;
}

export function localize(fiddle: FiddleData, inputDir: string): FiddleData {
  // Extract game version from fiddle
  const version = (fiddle.version as Record<string, unknown> | undefined)?.version;
  const gameVersion = typeof version === "string" ? version : "";

  const eng = loadLocalization(inputDir, gameVersion);
  const result = localizeRecursive(fiddle, eng) as FiddleData;

  let resolved = 0;
  let fallbacks = 0;
  // Quick stats pass
  const countStrings = (obj: unknown): void => {
    if (typeof obj === "string" && !obj.includes("/")) {
      resolved++;
    } else if (typeof obj === "string" && obj.includes("/")) {
      fallbacks++;
    } else if (obj && typeof obj === "object") {
      for (const v of Object.values(obj as Record<string, unknown>)) countStrings(v);
    }
  };
  countStrings(result);
  console.log(
    `  Localization: ${resolved.toLocaleString()} resolved, ${fallbacks.toLocaleString()} remaining slash-paths`,
  );

  return result;
}

/**
 * Check if a string value looks like a localization key (a slash-path reference).
 * These are self-referencing values where the value looks like "category/subcategory/field".
 */
function isLocalizationKey(value: string): boolean {
  return value.includes("/") && !value.startsWith("spr_") && !value.startsWith("Music/");
}

function loadLocalization(inputDir: string, gameVersion: string): Record<string, string> {
  // Collect all localization files in input dir
  const files: Array<{ name: string; version: string }> = [];

  if (existsSync(inputDir)) {
    for (const file of readdirSync(inputDir)) {
      // Match localization.json or localization-X.Y.Z.json
      if (file === "localization.json") {
        files.push({ name: file, version: "" });
      } else {
        const match = /^localization-(.+)\.json$/.exec(file);
        if (match) {
          files.push({ name: file, version: match[1] });
        }
      }
    }
  }

  // Sort by version preference: same version first, then descending semver, then unversioned
  files.sort((a, b) => {
    if (a.version === gameVersion) return -1;
    if (b.version === gameVersion) return 1;
    if (a.version && b.version) {
      // Simple semver comparison (descending — prefer newer)
      return b.version.localeCompare(a.version, undefined, { numeric: true, sensitivity: "base" });
    }
    if (a.version) return -1;
    if (b.version) return 1;
    return 0;
  });

  for (const file of files) {
    const path = resolve(inputDir, file.name);
    try {
      const data: LocalizationPack = JSON.parse(readFileSync(path, "utf-8"));
      if (data.eng && typeof data.eng === "object") {
        const count = Object.keys(data.eng).length;
        console.log(`  Loaded localization from ${file.name} (${count.toLocaleString()} entries)`);
        return data.eng;
      }
    } catch {
      console.warn(`  Warning: Failed to parse ${file.name}, skipping`);
    }
  }

  console.warn("  Warning: No localization file found, using snake_case→Title Case fallback only");
  return {};
}

function localizeRecursive(data: unknown, eng: Record<string, string>): unknown {
  if (typeof data === "string") {
    return resolveString(data, eng);
  }
  if (Array.isArray(data)) {
    return data.map((item) => localizeRecursive(item, eng));
  }
  if (data !== null && typeof data === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      // Only localize 'name', 'description', 'subject_line', etc. — not IDs/references
      if (
        typeof value === "string" &&
        (key === "name" ||
          key === "description" ||
          key === "subject_line" ||
          key === "objective_description" ||
          key === "job" ||
          key === "plural_name" ||
          key === "type" ||
          key === "local")
      ) {
        result[key] = resolveString(value, eng);
      } else {
        result[key] = localizeRecursive(value, eng);
      }
    }
    return result;
  }
  return data;
}

function resolveString(value: string, eng: Record<string, string>): string {
  if (!isLocalizationKey(value)) return value;

  // Direct lookup
  if (value in eng) return eng[value];

  // Fallback: use the item ID segment (not the field name like "name" or "description")
  // e.g. "items/furniture/tide_set/coral_lamp_blue/name" → use "coral_lamp_blue"
  const parts = value.split("/");
  // Find the most meaningful segment — skip generic field names at the end
  const genericFields = new Set([
    "description",
    "job",
    "local",
    "name",
    "objective_description",
    "plural_name",
    "subject_line",
    "type",
  ]);
  for (let i = parts.length - 1; i >= 0; i--) {
    if (!genericFields.has(parts[i])) {
      return snakeToTitle(parts[i]);
    }
  }
  return snakeToTitle(parts[parts.length - 2] ?? parts[parts.length - 1]);
}

function snakeToTitle(s: string): string {
  return s
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
