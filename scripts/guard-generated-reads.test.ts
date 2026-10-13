import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { readGuardMessage } from "./guard-generated-reads.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe("generated-data read guard", () => {
  it("denies Read & direct shell reads, with a short recovery instruction", () => {
    for (const input of [
      { tool_input: { file_path: "src/lib/data/tracker-data.json" }, tool_name: "Read" },
      { tool_input: { command: 'cat "src/lib/data/tracker-data.json"' }, tool_name: "Bash" },
      { tool_input: { command: "jq . <src/lib/data/tracker-data.json" }, tool_name: "Bash" },
      { tool_input: { command: "head src/lib/data/../data/tracker-data.json" }, tool_name: "Bash" },
    ]) {
      expect(readGuardMessage({ cwd: "/work/mistria", ...input })).toContain("Read src/lib/types");
    }
  });

  it("allows types, source, lookalikes, and commands that only mention the rule", () => {
    expect(
      readGuardMessage({ tool_input: { file_path: "src/lib/data/tracker-data.json.md" } }),
    ).toBeUndefined();
    expect(
      readGuardMessage({ tool_input: { file_path: "src/lib/types/tracker-data.ts" } }),
    ).toBeUndefined();
    expect(
      readGuardMessage({
        tool_input: { command: 'echo "src/lib/data/tracker-data.json"' },
        tool_name: "Bash",
      }),
    ).toBeUndefined();
  });

  it("resolves file-tool & shell symlinks", () => {
    const root = mkdtempSync(join(tmpdir(), "agent-read-"));
    roots.push(root);
    mkdirSync(join(root, "src/lib/data"), { recursive: true });
    writeFileSync(join(root, "src/lib/data/tracker-data.json"), "{}");
    symlinkSync(join(root, "src/lib/data"), join(root, "alias"), "junction");
    expect(
      readGuardMessage({ cwd: root, tool_input: { file_path: "alias/tracker-data.json" } }),
    ).toBeDefined();
    expect(
      readGuardMessage({
        cwd: root,
        tool_input: { command: "cat alias/tracker-data.json" },
        tool_name: "Bash",
      }),
    ).toBeDefined();
  });

  it("returns the blocking exit code & reason over the real stdin protocol", () => {
    const result = spawnSync(process.execPath, ["scripts/guard-generated-reads.ts"], {
      encoding: "utf8",
      input: JSON.stringify({ tool_input: { file_path: "src/lib/data/tracker-data.json" } }),
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Blocked generated tracker data read");
  });
});
