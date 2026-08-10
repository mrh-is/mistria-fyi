import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { parse } from "smol-toml";

const SOURCE_FILE_BY_ROOT_PATH: unique symbol = Symbol("sourceFileByRootPath");

export type ParsedGameData = Record<string, unknown> & {
  readonly [SOURCE_FILE_BY_ROOT_PATH]: ReadonlyMap<string, string>;
};

export interface ParsedGameDataResult {
  data: ParsedGameData;
  fileCount: number;
  sourceFileByRootPath: ReadonlyMap<string, string>;
}

/**
 * Parses the assets root's fiddle/ directory, mapping relative TOML paths to dotted data roots.
 * Non-TOML and .meta.toml files are skipped, while ancestor and descendant root collisions are
 * rejected. Provenance is embedded non-enumerably, so it survives mutation but not JSON
 * serialization.
 */
export function parseFiddle(assetsDir: string): ParsedGameDataResult {
  const fiddleDir = join(assetsDir, "fiddle");
  const data = {} as ParsedGameData;
  const sourceFileByRootPath = new Map<string, string>();

  walkDirectory(fiddleDir, fiddleDir, data, sourceFileByRootPath);
  Object.defineProperty(data, SOURCE_FILE_BY_ROOT_PATH, {
    enumerable: false,
    value: sourceFileByRootPath,
  });

  console.log(`  Parsed ${sourceFileByRootPath.size} TOML files from ${fiddleDir}`);
  return { data, fileCount: sourceFileByRootPath.size, sourceFileByRootPath };
}

/**
 * Finds the nearest provenance ancestor because the map indexes file roots while callers pass
 * entity or field paths.
 */
export function sourceFileFor(data: ParsedGameData, dottedPath: string): string {
  let candidate = dottedPath;
  while (candidate.length > 0) {
    const sourceFile = data[SOURCE_FILE_BY_ROOT_PATH].get(candidate);
    if (sourceFile) {
      return sourceFile;
    }
    const separator = candidate.lastIndexOf(".");
    candidate = separator === -1 ? "" : candidate.slice(0, separator);
  }
  throw new Error(`No TOML source file found for ${dottedPath}`);
}

function walkDirectory(
  dir: string,
  rootDir: string,
  data: ParsedGameData,
  sourceFileByRootPath: Map<string, string>,
): void {
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      walkDirectory(fullPath, rootDir, data, sourceFileByRootPath);
      continue;
    }

    if (!entry.endsWith(".toml") || entry.endsWith(".meta.toml")) {
      continue;
    }

    const relPath = relative(rootDir, fullPath).split(sep).join("/");
    const keyPath = relPath.replace(/\.toml$/, "").split("/");
    const sourceKey = keyPath.join(".");
    const conflictingKey = [...sourceFileByRootPath.keys()].find(
      (existing) =>
        existing === sourceKey ||
        existing.startsWith(`${sourceKey}.`) ||
        sourceKey.startsWith(`${existing}.`),
    );
    if (conflictingKey) {
      throw new Error(
        `Duplicate or colliding TOML destinations "${conflictingKey}" and "${sourceKey}" from ${relPath}`,
      );
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = parse(readFileSync(fullPath, "utf-8"));
    } catch (error) {
      throw new Error(`Failed to parse ${relPath} at ${sourceKey}`, { cause: error });
    }

    setNestedValue(data, keyPath, parsed, relPath);
    sourceFileByRootPath.set(sourceKey, relPath);
  }
}

function setNestedValue(
  target: Record<string, unknown>,
  path: string[],
  value: Record<string, unknown>,
  sourceFile: string,
): void {
  let current = target;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (!(key in current)) {
      current[key] = {};
    } else if (
      typeof current[key] !== "object" ||
      current[key] === null ||
      Array.isArray(current[key])
    ) {
      throw new Error(`Path collision while assigning ${sourceFile} at ${path.join(".")}`);
    }
    current = current[key] as Record<string, unknown>;
  }
  const lastKey = path[path.length - 1];
  if (lastKey in current) {
    throw new Error(`Duplicate or colliding path ${path.join(".")} from ${sourceFile}`);
  }
  current[lastKey] = value;
}
