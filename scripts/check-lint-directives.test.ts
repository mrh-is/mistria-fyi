import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { lintedFiles, unjustifiedDirectives } from "./check-lint-directives.js";

const SCRIPT = fileURLToPath(new URL("check-lint-directives.ts", import.meta.url));
const CLEAN = "export const x = 1;\n";
const UNJUSTIFIED = "// eslint-disable-next-line no-console\nexport const x = 1;\n";

const fixtures: string[] = [];

afterEach(() => {
  for (const dir of fixtures.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

/** A temporary Git repository whose index tracks `files`. */
function trackedFixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "lint-directives-"));
  fixtures.push(dir);
  execFileSync("git", ["init", "--quiet"], { cwd: dir });
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(join(dir, name), text);
  }
  execFileSync("git", ["add", "--", ...Object.keys(files)], { cwd: dir });
  return dir;
}

function runChecker(cwd: string, args: string[] = []) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: "utf8" });
}

describe("unjustifiedDirectives in scripts", () => {
  it("accepts directives that give a reason after --", () => {
    const text = [
      "// oxlint-disable-next-line no-await-in-loop -- Steps run in order.",
      "/* eslint-disable @typescript-eslint/no-unnecessary-condition -- Runtime JSON,",
      "   cast at the boundary. */",
      "const x = 1; // eslint-disable-line no-console -- Debug output.",
    ].join("\n");
    expect(unjustifiedDirectives("a.ts", text)).toEqual([]);
  });

  it("reports the line number of each directive without a reason", () => {
    const text = [
      "// oxlint-disable-next-line no-await-in-loop",
      "/* eslint-disable */",
      "const x = 1; // eslint-disable-line no-console",
      "// eslint-disable-next-line no-console --",
    ].join("\n");
    expect(unjustifiedDirectives("a.js", text)).toEqual([1, 2, 3, 4]);
  });

  it("ignores enable directives, prose, & directive-shaped strings", () => {
    const text = [
      "/* eslint-enable @typescript-eslint/no-unnecessary-condition */",
      "// flagged and need an eslint-disable comment, so add one",
      'const probe = "// oxlint-disable-next-line no-console";',
      "const template = `/* eslint-disable */`;",
    ].join("\n");
    expect(unjustifiedDirectives("a.ts", text)).toEqual([]);
  });
});

describe("unjustifiedDirectives in Svelte components", () => {
  it("checks script & template comments, not strings or markup text", () => {
    const text = [
      '<script lang="ts">',
      "  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Scratch index.",
      '  const label = "// oxlint-disable-next-line no-console";',
      "  // oxlint-disable-next-line no-console",
      "</script>",
      "",
      "<!-- eslint-disable-next-line svelte/no-at-html-tags -- Sanitized upstream. -->",
      "<p>{label}</p>",
      "<!-- eslint-disable-next-line svelte/no-at-html-tags -->",
      "<p>eslint-disable is plain text here</p>",
    ].join("\n");
    expect(unjustifiedDirectives("a.svelte", text)).toEqual([4, 9]);
  });
});

describe("check-lint-directives CLI", () => {
  it("passes after an unstaged rename of a clean file", () => {
    const dir = trackedFixture({ "old.ts": CLEAN });
    renameSync(join(dir, "old.ts"), join(dir, "renamed.ts"));
    const result = runChecker(dir);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });

  it("still checks the replacement file after an unstaged rename", () => {
    const dir = trackedFixture({ "old.ts": UNJUSTIFIED });
    renameSync(join(dir, "old.ts"), join(dir, "renamed.ts"));
    const result = runChecker(dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("renamed.ts:1:");
  });

  it("skips untracked files that Git ignores", () => {
    const dir = trackedFixture({ ".gitignore": "ignored.ts\n" });
    writeFileSync(join(dir, "ignored.ts"), UNJUSTIFIED);
    expect(runChecker(dir).status).toBe(0);
  });

  it("keeps other filesystem errors visible", () => {
    const dir = trackedFixture({ "a.ts": CLEAN });
    rmSync(join(dir, "a.ts"));
    mkdirSync(join(dir, "a.ts"));
    const result = runChecker(dir);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("EISDIR");
  });

  it("fails for an explicitly supplied missing path", () => {
    const dir = trackedFixture({ "a.ts": CLEAN });
    const result = runChecker(dir, ["missing.ts"]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("ENOENT");
  });
});

describe("lintedFiles", () => {
  it("keeps only files oxlint or ESLint lint", () => {
    expect(
      lintedFiles(["README.md", "a.ts", "b.svelte", "c.svelte.js", "d.mjs", "e.css", "f.sh"]),
    ).toEqual(["a.ts", "b.svelte", "c.svelte.js", "d.mjs"]);
  });
});
