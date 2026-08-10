import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { parse } from "smol-toml";

const SOURCE_FILES: unique symbol = Symbol("sourceFiles");

export type FiddleData = Record<string, unknown> & {
  readonly [SOURCE_FILES]: ReadonlyMap<string, string>;
};

export interface ParsedFiddle {
  data: FiddleData;
  fileCount: number;
  sourceFiles: Map<string, string>;
}

export function parseFiddle(assetsDir: string): ParsedFiddle {
  const fiddleDir = join(assetsDir, "fiddle");
  const data = {} as FiddleData;
  const sourceFiles = new Map<string, string>();

  walkDirectory(fiddleDir, fiddleDir, data, sourceFiles);
  Object.defineProperty(data, SOURCE_FILES, {
    enumerable: false,
    value: sourceFiles,
  });

  console.log(`  Parsed ${sourceFiles.size} TOML files from ${fiddleDir}`);
  return { data, fileCount: sourceFiles.size, sourceFiles };
}

export function sourceFileFor(fiddle: FiddleData, dottedPath: string): string {
  let candidate = dottedPath;
  while (candidate.length > 0) {
    const sourceFile = fiddle[SOURCE_FILES].get(candidate);
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
  result: FiddleData,
  sourceFiles: Map<string, string>,
): void {
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      walkDirectory(fullPath, rootDir, result, sourceFiles);
      continue;
    }

    if (!entry.endsWith(".toml") || entry.endsWith(".meta.toml")) {
      continue;
    }

    const relPath = relative(rootDir, fullPath).split(sep).join("/");
    const keyPath = relPath.replace(/\.toml$/, "").split("/");
    const sourceKey = keyPath.join(".");
    const conflictingKey = [...sourceFiles.keys()].find(
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

    setNestedValue(result, keyPath, parsed, relPath);
    sourceFiles.set(sourceKey, relPath);
  }
}

function setNestedValue(
  obj: Record<string, unknown>,
  path: string[],
  value: Record<string, unknown>,
  sourceFile: string,
): void {
  let current = obj;
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
