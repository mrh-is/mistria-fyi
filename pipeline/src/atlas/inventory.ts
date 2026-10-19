import { existsSync, readdirSync } from "node:fs";
import { join, posix, relative } from "node:path";

import { toPosixPath } from "../../../scripts/lib/paths.js";
import { compareStrings } from "../ordering.js";
import { fiddleKeyPath, parseFiddle } from "../parse/parse-fiddle.js";
import { claimsFor } from "./claims.js";

import type { PipelineClaim, PipelineReference } from "./claims.js";

/** One version's assets root: every file by folder, and every fiddle root's top-level shape. */
export interface AssetAtlas {
  fiddle: FiddleFileInventory[];
  folders: FolderInventory[];
  version: string;
}

/** A top-level folder of the assets root. Files are assets-relative POSIX paths, sorted. */
export interface FolderInventory {
  extensions: Record<string, number>;
  files: string[];
  name: string;
}

/** One fiddle TOML file, mapped to its dotted root, with each top-level key's shape. */
export interface FiddleFileInventory {
  claims: PipelineClaim[];
  keys: Record<string, string>;
  rootPath: string;
  sourceFile: string;
}

/** Files directly in the assets root, outside any folder. */
export const ROOT_FOLDER = ".";

// Operating-system & sync clutter, not game files.
const SYSTEM_FILES = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);
/** A table with at least this many keys, all of them tables, is summarized as an ID-keyed map. */
export const ID_MAP_MIN_KEYS = 8;
// Nesting levels below a top-level key that a shape summary spells out.
const SHAPE_DEPTH = 2;

/** Builds the atlas for one extracted assets root, marking the pipeline modules that claim each root. */
export function buildAtlas(
  assetsDir: string,
  version: string,
  references: readonly PipelineReference[],
): AssetAtlas {
  if (!existsSync(join(assetsDir, "fiddle"))) {
    throw new Error(
      `No fiddle/ in ${assetsDir}. Pass a game-files root holding vX.Y.Z/assets folders, or an extracted assets folder.`,
    );
  }
  return {
    fiddle: inventoryFiddle(assetsDir, references),
    folders: inventoryFolders(assetsDir),
    version,
  };
}

function inventoryFolders(assetsDir: string): FolderInventory[] {
  const folders = new Map<string, FolderInventory>();
  const entries = readdirSync(assetsDir, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || SYSTEM_FILES.has(entry.name)) continue;
    const file = toPosixPath(relative(assetsDir, join(entry.parentPath, entry.name)));
    const name = topFolder(file);
    const folder = folders.get(name) ?? { extensions: {}, files: [], name };
    folder.files.push(file);
    const extension = extensionOf(entry.name);
    folder.extensions[extension] = (folder.extensions[extension] ?? 0) + 1;
    folders.set(name, folder);
  }
  return [...folders.values()]
    .map((folder) => ({
      ...folder,
      extensions: sortedRecord(folder.extensions),
      files: folder.files.toSorted(compareStrings),
    }))
    .toSorted((a, b) => compareStrings(a.name, b.name));
}

/** The top-level folder holding an assets-relative POSIX path, or {@link ROOT_FOLDER}. */
export function topFolder(file: string): string {
  const segments = pathSegments(file);
  return segments.length > 1 ? segments[0] : ROOT_FOLDER;
}

/** A relative POSIX path's segments, outermost first. */
function pathSegments(file: string): string[] {
  const segments: string[] = [];
  for (let current = file; current !== "."; current = posix.dirname(current)) {
    segments.unshift(posix.basename(current));
  }
  return segments;
}

/** A file's extension for counting, keeping `.meta.toml` distinct from data `.toml`. */
export function extensionOf(fileName: string): string {
  if (fileName.endsWith(".meta.toml")) return ".meta.toml";
  return posix.extname(fileName).toLowerCase() || "(none)";
}

function inventoryFiddle(
  assetsDir: string,
  references: readonly PipelineReference[],
): FiddleFileInventory[] {
  const { data, sourceFileByRootPath } = parseFiddle(assetsDir);
  return [...sourceFileByRootPath]
    .map(([rootPath, sourceFile]) => {
      const root = valueAt(data, fiddleKeyPath(sourceFile));
      const keys: Record<string, string> = {};
      for (const key of Object.keys(root).toSorted(compareStrings)) {
        keys[key] = shapeOf(root[key]);
      }
      return { claims: claimsFor(rootPath, references), keys, rootPath, sourceFile };
    })
    .toSorted((a, b) => compareStrings(a.rootPath, b.rootPath));
}

function valueAt(
  data: Record<string, unknown>,
  keyPath: readonly string[],
): Record<string, unknown> {
  let current: unknown = data;
  for (const key of keyPath) {
    current = (current as Record<string, unknown>)[key];
  }
  return current as Record<string, unknown>;
}

/**
 * Summarizes a TOML value's type as a deterministic string, spelling out tables `depth` levels
 * deep. Arrays list the union of their element shapes, tables with many table-valued keys
 * collapse to `map<…>` of their merged entry shape, and `?` marks a field some entries lack.
 */
export function shapeOf(value: unknown, depth = SHAPE_DEPTH): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return "array";
    if (allRecords(value)) return `array<${mergedTableShape(value, depth - 1)}>`;
    const elements = new Set(value.map((element) => shapeOf(element, depth - 1)));
    return `array<${[...elements].toSorted(compareStrings).join(" | ")}>`;
  }
  if (value instanceof Date) return "datetime";
  if (isRecord(value)) {
    if (depth <= 0) return "table";
    const entries = Object.values(value);
    if (entries.length >= ID_MAP_MIN_KEYS && allRecords(entries)) {
      return `map<${mergedTableShape(entries, depth - 1)}>`;
    }
    return mergedTableShape([value], depth);
  }
  if (typeof value === "bigint") return "number";
  return typeof value;
}

function mergedTableShape(tables: readonly Record<string, unknown>[], depth: number): string {
  if (depth <= 0) return "table";
  const shapesByKey = new Map<string, Set<string>>();
  const countsByKey = new Map<string, number>();
  for (const table of tables) {
    for (const [key, value] of Object.entries(table)) {
      const shapes = shapesByKey.get(key) ?? new Set<string>();
      shapes.add(shapeOf(value, depth - 1));
      shapesByKey.set(key, shapes);
      countsByKey.set(key, (countsByKey.get(key) ?? 0) + 1);
    }
  }
  const fields = [...shapesByKey.keys()].toSorted(compareStrings).map((key) => {
    const optional = countsByKey.get(key) === tables.length ? "" : "?";
    const shapes = [...(shapesByKey.get(key) ?? [])].toSorted(compareStrings).join(" | ");
    return `${key}${optional}: ${shapes}`;
  });
  return `{${fields.join(", ")}}`;
}

function allRecords(values: readonly unknown[]): values is Record<string, unknown>[] {
  return values.every((value) => isRecord(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)
  );
}

function sortedRecord(record: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(record).toSorted(([a], [b]) => compareStrings(a, b)));
}
