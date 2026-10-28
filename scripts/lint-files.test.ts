import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { lintCommands } from "./lint-files.js";

describe("changed-file lint", () => {
  it("preserves the full script scopes & zero-warning checks", () => {
    const commands = lintCommands(undefined, false);
    expect(commands).toContainEqual(["run", "lint:shell"]);
    expect(commands.find((command) => command.includes("eslint"))).toContain("**/*.svelte.{js,ts}");
    expect(commands.find((command) => command.includes("oxlint"))).toContain("--deny-warnings");
    expect(commands.find((command) => command.includes("stylelint"))).toContain(
      "src/**/*.{css,svelte}",
    );
  });

  it("only routes applicable files to their lint owners, with paths after --", () => {
    const files = [
      "README.md",
      "scripts/a.ts",
      "src/a.svelte",
      "src/store.svelte.ts",
      "outside.css",
      "src/theme.css",
      "script.sh",
    ];
    const commands = lintCommands(files, false);
    expect(commands.find((command) => command.includes("oxfmt"))?.slice(-files.length)).toEqual(
      files,
    );
    expect(commands.find((command) => command.includes("oxlint"))?.slice(-4)).toEqual([
      "--",
      "scripts/a.ts",
      "src/a.svelte",
      "src/store.svelte.ts",
    ]);
    expect(commands.find((command) => command.includes("eslint"))?.slice(-3)).toEqual([
      "--",
      "src/a.svelte",
      "src/store.svelte.ts",
    ]);
    expect(commands.find((command) => command.includes("stylelint"))?.slice(-3)).toEqual([
      "--",
      "src/a.svelte",
      "src/theme.css",
    ]);
    expect(commands).toContainEqual(["run", "lint:shell"]);
  });

  it("never expands an empty changed-file set into whole-repository fixes", () => {
    expect(lintCommands([], true)).toEqual([]);
    expect(lintCommands(["README.md"], true)).toEqual([
      ["exec", "oxfmt", "--no-error-on-unmatched-pattern", "--", "README.md"],
    ]);
  });

  it("lets oxlint select nothing when every changed script is one it ignores", () => {
    const commands = lintCommands(["tests/lint-probes/probe.ts"], false);
    expect(commands.find((command) => command.includes("oxlint"))).toContain(
      "--no-error-on-unmatched-pattern",
    );
  });

  it("formats only the named file, and returns real unfixable lint errors", () => {
    const root = mkdtempSync(join(process.cwd(), "agent-lint-probe-"));
    try {
      const target = join(root, "a file.ts");
      const untouched = join(root, "untouched.ts");
      writeFileSync(target, "debugger\n");
      writeFileSync(untouched, "const untouched=1\n");
      const result = spawnSync(
        process.execPath,
        ["scripts/lint-files.ts", "--fix", "--files", target],
        { encoding: "utf8" },
      );
      expect(result.status).toBe(1);
      expect(result.stdout).toContain("no-debugger");
      expect(readFileSync(target, "utf8")).toBe("debugger;\n");
      expect(readFileSync(untouched, "utf8")).toBe("const untouched=1\n");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
