import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { parse } from "smol-toml";
import { open } from "yauzl-promise";

import { expectRecord } from "./data-shapes.js";

const SOURCE_FILE_BY_ROOT_PATH: unique symbol = Symbol("sourceFileByRootPath");

export type ParsedGameData = Record<string, unknown> & {
  readonly [SOURCE_FILE_BY_ROOT_PATH]: ReadonlyMap<string, string>;
};

export interface ParsedGameDataResult {
  data: ParsedGameData;
  fileCount: number;
  sourceFileByRootPath: ReadonlyMap<string, string>;
}

interface TomlEntry {
  keyPath: string[];
  relPath: string;
  sourceKey: string;
  text: string;
}

/**
 * Parses the assets root's fiddle/ directory, mapping relative TOML paths to dotted data roots.
 * Non-TOML and .meta.toml files are skipped, while ancestor and descendant root collisions are
 * rejected. Provenance is embedded non-enumerably, so it survives mutation but not JSON
 * serialization.
 */
export function parseFiddle(assetsDir: string): ParsedGameDataResult {
  const fiddleDir = join(assetsDir, "fiddle");
  const sourceFileByRootPath = new Map<string, string>();
  const data = attachProvenance({}, sourceFileByRootPath);

  walkDirectory(fiddleDir, fiddleDir, (entry) => {
    processTomlEntry(data, sourceFileByRootPath, entry);
  });

  console.log(`  Parsed ${sourceFileByRootPath.size} TOML files from ${fiddleDir}`);
  return { data, fileCount: sourceFileByRootPath.size, sourceFileByRootPath };
}

const FIDDLE_ZIP_PREFIX = "assets/fiddle/";

/**
 * Parses `fiddle/` directly out of the game's `assets.zip`, without extracting it to disk. Reads
 * only the small TOML entries the pipeline needs; the zip's PNGs and other binary assets are never
 * decompressed. Produces the same {@link ParsedGameDataResult} shape as {@link parseFiddle}, so
 * every downstream extractor works unmodified regardless of source. When `paths` is given, only
 * TOML entries whose dotted root path starts with one of those paths is parsed — useful for
 * lightweight runs that only need a subset of the data (e.g. villager sprite extraction needs
 * only `npcs`).
 */
export async function parseFiddleFromZip(
  zipPath: string,
  paths?: readonly string[],
): Promise<ParsedGameDataResult> {
  const sourceFileByRootPath = new Map<string, string>();
  const data = attachProvenance({}, sourceFileByRootPath);

  const zipFile = await open(zipPath);
  try {
    for await (const entry of zipFile) {
      const tomlEntry = await zipEntryToTomlEntry(entry, paths);
      if (!tomlEntry) continue;
      processTomlEntry(data, sourceFileByRootPath, tomlEntry);
    }
  } finally {
    await zipFile.close();
  }

  console.log(`  Parsed ${sourceFileByRootPath.size} TOML files from ${zipPath}`);
  return { data, fileCount: sourceFileByRootPath.size, sourceFileByRootPath };
}

/**
 * Embeds `sourceFileByRootPath` as non-enumerable provenance, so it survives mutation but not JSON
 * serialization. Test fixtures use it to build fiddles that {@link sourceFileFor} can resolve.
 */
export function attachProvenance(
  data: Record<string, unknown>,
  sourceFileByRootPath: ReadonlyMap<string, string>,
): ParsedGameData {
  Object.defineProperty(data, SOURCE_FILE_BY_ROOT_PATH, {
    enumerable: false,
    value: sourceFileByRootPath,
  });
  return data as ParsedGameData;
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

/** Rejects a root path that collides with an existing one, including an ancestor/descendant pair. */
function assertNoCollision(
  sourceFileByRootPath: ReadonlyMap<string, string>,
  sourceKey: string,
  relPath: string,
): void {
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
}

function parseTOMLEntry(text: string, relPath: string, sourceKey: string): Record<string, unknown> {
  try {
    return parse(text);
  } catch (error) {
    throw new Error(`Failed to parse ${relPath} at ${sourceKey}`, { cause: error });
  }
}

/** Processes a single TOML entry: checks collisions, parses, and registers in the data map. */
function processTomlEntry(
  data: ParsedGameData,
  sourceFileByRootPath: Map<string, string>,
  entry: TomlEntry,
): void {
  assertNoCollision(sourceFileByRootPath, entry.sourceKey, entry.relPath);

  const parsed = parseTOMLEntry(entry.text, entry.relPath, entry.sourceKey);
  registerSource(data, sourceFileByRootPath, entry.keyPath, parsed, entry.relPath);
}

function registerSource(
  data: ParsedGameData,
  sourceFileByRootPath: Map<string, string>,
  keyPath: string[],
  parsed: Record<string, unknown>,
  relPath: string,
): void {
  setNestedValue(data, keyPath, parsed, relPath);
  sourceFileByRootPath.set(keyPath.join("."), relPath);
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
  const lastKey = path.at(-1);
  if (lastKey === undefined) {
    throw new Error(`Empty assignment path from ${sourceFile}`);
  }
  if (lastKey in current) {
    throw new Error(`Duplicate or colliding path ${path.join(".")} from ${sourceFile}`);
  }
  current[lastKey] = value;
}

function walkDirectory(dir: string, rootDir: string, onEntry: (entry: TomlEntry) => void): void {
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      walkDirectory(fullPath, rootDir, onEntry);
      continue;
    }

    if (!entry.endsWith(".toml") || entry.endsWith(".meta.toml")) {
      continue;
    }

    const relPath = relative(rootDir, fullPath).split(sep).join("/");
    const keyPath = relPath.replace(/\.toml$/, "").split("/");
    const sourceKey = keyPath.join(".");
    const text = readFileSync(fullPath, "utf8");

    onEntry({ keyPath, relPath, sourceKey, text });
  }
}

/** Converts a zip entry to a TomlEntry by reading its content, or returns null if not a valid fiddle TOML file. */
async function zipEntryToTomlEntry(
  entry: {
    filename: string;
    openReadStream: () => Promise<AsyncIterable<Buffer>>;
  },
  paths?: readonly string[],
): Promise<null | TomlEntry> {
  if (entry.filename.endsWith("/")) return null;
  if (!entry.filename.startsWith(FIDDLE_ZIP_PREFIX)) return null;
  if (!entry.filename.endsWith(".toml") || entry.filename.endsWith(".meta.toml")) return null;

  const relPath = entry.filename.slice(FIDDLE_ZIP_PREFIX.length);
  const keyPath = relPath.replace(/\.toml$/, "").split("/");
  const sourceKey = keyPath.join(".");
  if (paths !== undefined && !paths.some((p) => sourceKey === p || sourceKey.startsWith(`${p}.`))) {
    return null;
  }

  const stream = await entry.openReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");

  return { keyPath, relPath, sourceKey, text };
}

/** The parser registers cutscenes.toml as one flat cutscene table. */
export function getCutsceneRecords(data: ParsedGameData): Record<string, Record<string, unknown>> {
  if (data.cutscenes === undefined) return {};
  const context = { fieldPath: "cutscenes", sourcePath: sourceFileFor(data, "cutscenes") };
  const raw = expectRecord(data.cutscenes, context);
  if (Object.hasOwn(raw, "cutscenes")) {
    throw new Error(`Expected flat cutscene table in ${context.sourcePath}`);
  }
  return Object.fromEntries(
    Object.entries(raw).map(([id, entry]) => [
      id,
      expectRecord(entry, { ...context, fieldPath: `cutscenes.${id}` }),
    ]),
  );
}
