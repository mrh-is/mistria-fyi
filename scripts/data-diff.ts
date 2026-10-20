import "#scripts/lib/require-pinned-node";

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Semantic diff of the generated tracker data (#95), run as `pnpm run data:diff [base-ref]`.
 *
 * Compares `src/lib/data/tracker-data.json` at a Git ref (default `origin/main`) with the working
 * copy and prints one line per added, removed, or changed JSON path, so a regeneration can be
 * reviewed by entity instead of as a reformatted blob. Exits 0 when the data is identical, 1 when
 * it differs, and 2 on an error, like diff(1).
 */

export const TRACKER_DATA_PATH = "src/lib/data/tracker-data.json";

type Json = boolean | Json[] | null | number | string | { [key: string]: Json };

export type Change =
  | { from: Json; kind: "changed"; path: string; to: Json }
  | { kind: "added"; path: string; value: Json }
  | { kind: "removed"; path: string; value: Json };

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

function isObject(value: Json): value is Record<string, Json> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function keyPath(parent: string, key: string): string {
  if (IDENTIFIER.test(key)) {
    return parent === "" ? key : `${parent}.${key}`;
  }
  return `${parent}[${JSON.stringify(key)}]`;
}

/** The array's elements keyed by their unique string `id`, or undefined if they don't all have one. */
function idKeyed(array: Json[]): Map<string, Json> | undefined {
  const byId = new Map<string, Json>();
  for (const element of array) {
    const id = isObject(element) ? element.id : undefined;
    if (typeof id !== "string" || byId.has(id)) {
      return undefined;
    }
    byId.set(id, element);
  }
  return byId;
}

/** True when every element is a scalar and none repeats, so the array reads as an ordered set. */
function isScalarSet(array: Json[]): boolean {
  return (
    array.every((element) => element === null || typeof element !== "object") &&
    new Set(array).size === array.length
  );
}

function diffMaps(path: string, from: Map<string, Json>, to: Map<string, Json>, out: Change[]) {
  for (const [key, value] of from) {
    if (!to.has(key)) {
      out.push({ kind: "removed", path: keyPath(path, key), value });
    }
  }
  for (const [key, value] of to) {
    const child = keyPath(path, key);
    if (from.has(key)) {
      diffValue(child, from.get(key) as Json, value, out);
    } else {
      out.push({ kind: "added", path: child, value });
    }
  }
}

function diffArrays(path: string, from: Json[], to: Json[], out: Change[]) {
  const fromIds = idKeyed(from);
  const toIds = idKeyed(to);
  if (fromIds && toIds) {
    for (const [id, value] of fromIds) {
      if (!toIds.has(id)) {
        out.push({ kind: "removed", path: `${path}[id=${id}]`, value });
      }
    }
    for (const [id, value] of toIds) {
      const before = fromIds.get(id);
      if (before === undefined) {
        out.push({ kind: "added", path: `${path}[id=${id}]`, value });
      } else {
        diffValue(`${path}[id=${id}]`, before, value, out);
      }
    }
    return;
  }

  if (isScalarSet(from) && isScalarSet(to)) {
    const before = new Set(from);
    const after = new Set(to);
    const removed = from.filter((element) => !after.has(element));
    const added = to.filter((element) => !before.has(element));
    for (const value of removed) {
      out.push({ kind: "removed", path: `${path}[]`, value });
    }
    for (const value of added) {
      out.push({ kind: "added", path: `${path}[]`, value });
    }
    const kept = from.filter((element) => after.has(element));
    const keptAfter = to.filter((element) => before.has(element));
    if (kept.some((element, index) => element !== keptAfter[index])) {
      out.push({ from: kept, kind: "changed", path: `${path} (order)`, to: keptAfter });
    }
    return;
  }

  const shared = Math.min(from.length, to.length);
  for (let index = 0; index < shared; index++) {
    diffValue(`${path}[${index}]`, from[index], to[index], out);
  }
  for (let index = shared; index < from.length; index++) {
    out.push({ kind: "removed", path: `${path}[${index}]`, value: from[index] });
  }
  for (let index = shared; index < to.length; index++) {
    out.push({ kind: "added", path: `${path}[${index}]`, value: to[index] });
  }
}

function diffValue(path: string, from: Json, to: Json, out: Change[]) {
  if (isObject(from) && isObject(to)) {
    diffMaps(path, new Map(Object.entries(from)), new Map(Object.entries(to)), out);
  } else if (Array.isArray(from) && Array.isArray(to)) {
    diffArrays(path, from, to, out);
  } else if (from !== to) {
    out.push({ from, kind: "changed", path: path === "" ? "(root)" : path, to });
  }
}

/**
 * Every path-level difference from `from` to `to`. Objects compare by key; arrays of objects with
 * unique string `id`s compare by id, arrays of unique scalars compare as ordered sets (with one
 * order change line), and other arrays compare by index.
 */
export function diffJson(from: unknown, to: unknown): Change[] {
  const out: Change[] = [];
  diffValue("", from as Json, to as Json, out);
  return out;
}

export function formatChange(change: Change): string {
  switch (change.kind) {
    case "added":
      return `+ ${change.path}: ${JSON.stringify(change.value)}`;

    case "removed":
      return `- ${change.path}: ${JSON.stringify(change.value)}`;

    case "changed":
      return `~ ${change.path}: ${JSON.stringify(change.from)} → ${JSON.stringify(change.to)}`;
  }
}

export function formatSummary(changes: Change[]): string {
  const count = (kind: Change["kind"]) => changes.filter((change) => change.kind === kind).length;
  return `${count("added")} added, ${count("removed")} removed, ${count("changed")} changed`;
}

/** The tracker data at `ref`, read through Git so the working tree stays untouched. */
export function readAtRef(root: string, ref: string): unknown {
  const text = execFileSync("git", ["show", `${ref}:${TRACKER_DATA_PATH}`], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(text) as unknown;
}

export function runDataDiff(root: string, baseRef: string): { exitCode: number; lines: string[] } {
  const base = readAtRef(root, baseRef);
  const working = JSON.parse(readFileSync(join(root, TRACKER_DATA_PATH), "utf8")) as unknown;
  const changes = diffJson(base, working);
  if (changes.length === 0) {
    return { exitCode: 0, lines: [`No tracker data changes from ${baseRef}.`] };
  }
  return {
    exitCode: 1,
    lines: [
      `Tracker data changes from ${baseRef} to the working copy:`,
      ...changes.map((change) => formatChange(change)),
      formatSummary(changes),
    ],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  if (args.length > 1 || args[0]?.startsWith("-")) {
    console.error("Usage: pnpm run data:diff [base-ref]");
    process.exitCode = 2;
  } else {
    try {
      const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
        encoding: "utf8",
      }).trim();
      const { exitCode, lines } = runDataDiff(root, args[0] ?? "origin/main");
      console.log(lines.join("\n"));
      process.exitCode = exitCode;
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 2;
    }
  }
}
