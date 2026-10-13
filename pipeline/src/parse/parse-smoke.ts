import type { ParsedGameDataResult } from "./parse-fiddle.js";

const CANONICAL_PATHS = ["items.other.cooked_dishes", "npcs.holt", "dungeons.dungeons.biomes"];

/**
 * Checks parser structure for any game version, with an optional profile for the canonical assets
 * (`CURRENT_GAME_VERSION`).
 */
export function checkParseSmoke(parsed: ParsedGameDataResult, profile?: "canonical"): void {
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
  if (profile === "canonical") {
    if (parsed.fileCount !== 298) throw new Error(`Expected 298 files, got ${parsed.fileCount}`);
    for (const path of CANONICAL_PATHS) {
      let current: unknown = parsed.data;
      for (const part of path.split(".")) {
        current = (current as Record<string, unknown> | undefined)?.[part];
      }
      if (current === undefined) throw new Error(`Missing representative path: ${path}`);
    }
  }
}
