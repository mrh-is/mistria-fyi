import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  diffJson,
  formatChange,
  formatSummary,
  runDataDiff,
  TRACKER_DATA_PATH,
} from "./data-diff.js";

describe("diffJson", () => {
  it("reports nothing for equal data, regardless of key order", () => {
    expect(diffJson({ a: 1, b: { c: [1, 2] } }, { a: 1, b: { c: [1, 2] } })).toEqual([]);
  });

  it("reports added, removed, & changed object paths", () => {
    const from = { quests: { fetch: { iron: { reward: 100 }, wood: { reward: 5 } } } };
    const to = {
      quests: { fetch: { copper: { reward: 7 }, iron: { reward: 120, visibility: "seal" } } },
    };
    expect(diffJson(from, to).map((change) => formatChange(change))).toEqual([
      '- quests.fetch.wood: {"reward":5}',
      '+ quests.fetch.copper: {"reward":7}',
      "~ quests.fetch.iron.reward: 100 → 120",
      '+ quests.fetch.iron.visibility: "seal"',
    ]);
  });

  it("brackets keys that are not identifiers", () => {
    expect(diffJson({ "a-b": { "1": true } }, { "a-b": { "1": false } })).toEqual([
      { from: true, kind: "changed", path: '["a-b"]["1"]', to: false },
    ]);
  });

  it("matches id-keyed object arrays by id", () => {
    const from = {
      sources: [
        { id: "a", n: 1 },
        { id: "b", n: 2 },
      ],
    };
    const to = {
      sources: [
        { id: "c", n: 3 },
        { id: "b", n: 4 },
      ],
    };
    expect(diffJson(from, to).map((change) => formatChange(change))).toEqual([
      '- sources[id=a]: {"id":"a","n":1}',
      '+ sources[id=c]: {"id":"c","n":3}',
      "~ sources[id=b].n: 2 → 4",
    ]);
  });

  it("reports an id-keyed reorder as one order line", () => {
    expect(diffJson({ s: [{ id: "a" }, { id: "b" }] }, { s: [{ id: "b" }, { id: "a" }] })).toEqual([
      { from: ["a", "b"], kind: "changed", path: "s (order)", to: ["b", "a"] },
    ]);
  });

  it("quotes ids that are not identifiers", () => {
    expect(diffJson({ s: [{ id: "x].y", n: 1 }] }, { s: [{ id: "x].y", n: 2 }] })).toEqual([
      { from: 1, kind: "changed", path: 's[id="x].y"].n', to: 2 },
    ]);
  });

  it("labels a root reorder", () => {
    expect(diffJson([1, 2], [2, 1])).toEqual([
      { from: [1, 2], kind: "changed", path: "(root) (order)", to: [2, 1] },
    ]);
  });

  it("treats unique scalar arrays as ordered sets", () => {
    expect(diffJson({ order: ["a", "b", "c"] }, { order: ["x", "a", "c"] })).toEqual([
      { kind: "removed", path: "order[]", value: "b" },
      { kind: "added", path: "order[]", value: "x" },
    ]);
    expect(diffJson({ order: ["a", "b"] }, { order: ["b", "a"] })).toEqual([
      { from: ["a", "b"], kind: "changed", path: "order (order)", to: ["b", "a"] },
    ]);
  });

  it("compares other arrays by index", () => {
    expect(diffJson({ tiers: [1, 1, 2] }, { tiers: [1, 3] })).toEqual([
      { from: 1, kind: "changed", path: "tiers[1]", to: 3 },
      { kind: "removed", path: "tiers[2]", value: 2 },
    ]);
  });

  it("reports type changes as a single change", () => {
    expect(diffJson({ a: { b: 1 } }, { a: [1] })).toEqual([
      { from: { b: 1 }, kind: "changed", path: "a", to: [1] },
    ]);
    expect(diffJson(1, 2)).toEqual([{ from: 1, kind: "changed", path: "(root)", to: 2 }]);
  });

  it("summarizes counts by kind", () => {
    expect(formatSummary(diffJson({ a: 1, b: 2 }, { a: 3, c: 4 }))).toBe(
      "1 added, 1 removed, 1 changed",
    );
  });
});

function repoWith(committed: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "data-diff-"));
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "commit.gpgsign=false", ...args], { cwd: dir, stdio: "pipe" });
  git("init", "-q");
  mkdirSync(dirname(join(dir, TRACKER_DATA_PATH)), { recursive: true });
  writeFileSync(join(dir, TRACKER_DATA_PATH), JSON.stringify(committed));
  git("add", ".");
  git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "base");
  return dir;
}

describe("runDataDiff", () => {
  let root: string | undefined;

  afterEach(() => {
    if (root !== undefined) {
      rmSync(root, { force: true, recursive: true });
      root = undefined;
    }
  });

  it("reports no changes when the working copy matches the ref, even if reformatted", () => {
    root = repoWith({ a: { b: 1 } });
    writeFileSync(join(root, TRACKER_DATA_PATH), `${JSON.stringify({ a: { b: 1 } }, null, 2)}\n`);
    expect(runDataDiff(root, "HEAD")).toEqual(["No tracker data changes from HEAD."]);
  });

  it("lists path-level changes when the working copy differs", () => {
    root = repoWith({ a: { b: 1 } });
    writeFileSync(join(root, TRACKER_DATA_PATH), JSON.stringify({ a: { b: 2 } }));
    expect(runDataDiff(root, "HEAD")).toEqual([
      "Tracker data changes from HEAD to the working copy:",
      "~ a.b: 1 → 2",
      "0 added, 0 removed, 1 changed",
    ]);
  });

  it("throws when the ref doesn't exist", () => {
    const repo = repoWith({});
    root = repo;
    expect(() => runDataDiff(repo, "no-such-ref")).toThrow("no-such-ref");
  });
});
