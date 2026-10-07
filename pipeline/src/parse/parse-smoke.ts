import type { ParsedGameDataResult } from "./parse-fiddle.js";

const V105_PATHS = ["items.other.cooked_dishes", "npcs.holt", "dungeons.dungeons.biomes"];

/** Checks parser structure for any game version, with an optional canonical v1.0.5 fixture profile. */
export function checkParseSmoke(parsed: ParsedGameDataResult, profile?: "v1.0.5"): void {
  if (parsed.fileCount === 0) throw new Error("No TOML files were parsed.");
  if (parsed.fileCount !== parsed.sourceFileByRootPath.size) {
    throw new Error("Parsed TOML count does not match source provenance.");
  }
  for (const [path, file] of parsed.sourceFileByRootPath) {
    if (!file.endsWith(".toml")) throw new Error(`Invalid TOML provenance for ${path}: ${file}`);
    let current: unknown = parsed.data;
    for (const part of path.split(".")) {
      if (typeof current !== "object" || current === null || Array.isArray(current)) {
        throw new Error(`Missing parsed root: ${path}`);
      }
      current = (current as Record<string, unknown>)[part];
    }
    if (typeof current !== "object" || current === null || Array.isArray(current)) {
      throw new Error(`Missing parsed root: ${path}`);
    }
  }
  if (profile === "v1.0.5") {
    if (parsed.fileCount !== 297) throw new Error(`Expected 297 files, got ${parsed.fileCount}`);
    for (const path of V105_PATHS) {
      let current: unknown = parsed.data;
      for (const part of path.split(".")) {
        current = (current as Record<string, unknown> | undefined)?.[part];
      }
      if (current === undefined) throw new Error(`Missing representative path: ${path}`);
    }
  }
}
