import { compareStrings } from "../ordering.js";

import type { AssetAtlas, FiddleFileInventory } from "./inventory.js";

/** What changed between two versions' atlases. */
export interface AtlasDiff {
  after: string;
  before: string;
  fiddle: {
    added: string[];
    changed: FiddleFileDiff[];
    removed: string[];
  };
  files: {
    added: string[];
    removed: string[];
  };
}

/** One fiddle root present in both versions whose top-level keys or their shapes changed. */
export interface FiddleFileDiff {
  addedKeys: string[];
  removedKeys: string[];
  reshapedKeys: ReshapedKey[];
  rootPath: string;
}

export interface ReshapedKey {
  after: string;
  before: string;
  key: string;
}

/** Compares two atlases: files across every folder, then fiddle roots & their top-level keys. */
export function diffAtlases(before: AssetAtlas, after: AssetAtlas): AtlasDiff {
  const beforeFiles = new Set(before.folders.flatMap((folder) => folder.files));
  const afterFiles = new Set(after.folders.flatMap((folder) => folder.files));
  const beforeRoots = new Map(before.fiddle.map((file) => [file.rootPath, file]));
  const afterRoots = new Map(after.fiddle.map((file) => [file.rootPath, file]));

  const changed: FiddleFileDiff[] = [];
  for (const [rootPath, afterFile] of afterRoots) {
    const beforeFile = beforeRoots.get(rootPath);
    if (!beforeFile) continue;
    const diff = diffFiddleFile(beforeFile, afterFile);
    if (diff) changed.push(diff);
  }

  return {
    after: after.version,
    before: before.version,
    fiddle: {
      added: missingFrom(afterRoots.keys(), beforeRoots),
      changed: changed.toSorted((a, b) => compareStrings(a.rootPath, b.rootPath)),
      removed: missingFrom(beforeRoots.keys(), afterRoots),
    },
    files: {
      added: missingFrom(afterFiles, beforeFiles),
      removed: missingFrom(beforeFiles, afterFiles),
    },
  };
}

function diffFiddleFile(
  before: FiddleFileInventory,
  after: FiddleFileInventory,
): FiddleFileDiff | undefined {
  const beforeKeys = new Map(Object.entries(before.keys));
  const afterKeys = new Map(Object.entries(after.keys));
  const reshapedKeys: ReshapedKey[] = [];
  for (const [key, afterShape] of afterKeys) {
    const beforeShape = beforeKeys.get(key);
    if (beforeShape !== undefined && beforeShape !== afterShape) {
      reshapedKeys.push({ after: afterShape, before: beforeShape, key });
    }
  }
  const diff = {
    addedKeys: missingFrom(afterKeys.keys(), beforeKeys),
    removedKeys: missingFrom(beforeKeys.keys(), afterKeys),
    reshapedKeys: reshapedKeys.toSorted((a, b) => compareStrings(a.key, b.key)),
    rootPath: after.rootPath,
  };
  const unchanged =
    diff.addedKeys.length === 0 && diff.removedKeys.length === 0 && reshapedKeys.length === 0;
  return unchanged ? undefined : diff;
}

function missingFrom(
  candidates: Iterable<string>,
  other: { has: (value: string) => boolean },
): string[] {
  return [...candidates].filter((value) => !other.has(value)).toSorted(compareStrings);
}
