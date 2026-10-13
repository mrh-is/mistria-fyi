import { readdirSync, readFileSync } from "node:fs";
import { posix } from "node:path";
import { describe, expect, it } from "vitest";

import { pinnedNodeMismatch, readPinnedNodeVersion } from "#scripts/lib/pinned-node";

// Entry points that skip the guard, with the reason. The Claude PreToolUse hook runs on every edit
// with the shell's Node, before dependencies exist in a fresh worktree; failing there would turn
// a version mismatch into a broken edit guard, and the hook doesn't depend on Node's version. The
// machine doctor runs on whatever Node is installed, before pnpm exists, so it can report it.
const unguarded = new Map([
  ["scripts/guard-generated-paths.ts", "Claude edit-guard hook"],
  ["scripts/guard-generated-reads.ts", "Dependency-free read guard on the shell runtime"],
  ["scripts/format-agent-edit.ts", "Hook delegates formatter execution to pnpm’s pinned runtime"],
  ["scripts/lint-agent-stop.ts", "Hook delegates lint execution to pnpm’s pinned runtime"],
  ["scripts/agent-subagent-start.ts", "Dependency-free subagent context hook"],
  ["scripts/machine-doctor.ts", "Reports a missing or wrong Node"],
]);

// Config files that package binaries load directly, so `node_modules/.bin/<tool>` is guarded too.
const configEntries = ["vite.config.ts", "playwright.config.ts", "playwright.pwa.config.ts"];

const guardImport =
  /^import "(?:#scripts\/lib\/require-pinned-node|(?:\.\.\/)+scripts\/lib\/require-pinned-node\.js)";$/mu;

function listFiles(directory: string): string[] {
  return readdirSync(directory).map((name) => posix.join(directory, name));
}

/** Collects `node <file>` & `tsx <file>` targets from a command string, relative to the root. */
function commandTargets(command: string): string[] {
  const targets: string[] = [];
  let cwd = ".";
  for (const part of command.split(/&&|;|\n/u)) {
    const cd = /^\s*cd\s+(\S+)\s*$/u.exec(part);
    if (cd) {
      cwd = cd[1];
      continue;
    }
    for (const match of part.matchAll(
      /\b(?:node|tsx)\s+\\?"?(?:\$CLAUDE_PROJECT_DIR\/)?([\w./-]+\.ts)\b/gu,
    )) {
      // POSIX separators on every platform, so targets match the forward-slash paths above.
      targets.push(posix.normalize(posix.join(cwd, match[1])));
    }
  }
  return targets;
}

function entryPoints(): string[] {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };
  const sources = [
    ...Object.values(packageJson.scripts),
    ...listFiles(".github/workflows").map((file) => readFileSync(file, "utf8")),
    ...listFiles(".husky")
      .filter((file) => !file.endsWith("_"))
      .map((file) => readFileSync(file, "utf8")),
    ...listFiles("scripts")
      .filter((file) => file.endsWith(".sh"))
      .map((file) => readFileSync(file, "utf8")),
    readFileSync(".claude/settings.json", "utf8"),
    readFileSync(".codex/hooks.json", "utf8"),
  ];
  return [
    ...new Set([...sources.flatMap((source) => commandTargets(source)), ...configEntries]),
  ].toSorted();
}

describe("pinnedNodeMismatch", () => {
  it("accepts the pinned release with or without the v prefix", () => {
    expect(pinnedNodeMismatch("v24.21.0", "24.21.0")).toBeUndefined();
    expect(pinnedNodeMismatch("24.21.0", "24.21.0")).toBeUndefined();
  });

  it("names both versions and the pnpm fix on a mismatch", () => {
    const message = pinnedNodeMismatch("v26.5.0", "24.21.0");
    expect(message).toContain("Node 26.5.0");
    expect(message).toContain("pins 24.21.0");
    expect(message).toContain("pnpm exec node");
  });

  it("reads .node-version from the repository root", () => {
    expect(readPinnedNodeVersion()).toBe(readFileSync(".node-version", "utf8").trim());
  });
});

describe("require-pinned-node coverage", () => {
  const entries = entryPoints();

  it("finds the repository's entry points", () => {
    expect(entries).toContain("scripts/verify.ts");
    expect(entries).toContain("pipeline/src/main.ts");
    expect(entries).toContain("scripts/check-attribution.ts");
    expect(entries).toContain("scripts/guard-generated-paths.ts");
  });

  it.each(entries.filter((entry) => !unguarded.has(entry)))(
    "%s imports the guard before anything else",
    (entry) => {
      const source = readFileSync(entry, "utf8");
      const firstImport = /^import .*$/mu.exec(source)?.[0];
      expect(firstImport).toMatch(guardImport);
    },
  );

  it("runs Git hooks through pnpm, which supplies the pinned Node", () => {
    for (const hook of listFiles(".husky").filter((file) => !file.endsWith("_"))) {
      for (const line of readFileSync(hook, "utf8").split("\n")) {
        expect(line).not.toMatch(/^\s*node\s/u);
      }
    }
  });
});
