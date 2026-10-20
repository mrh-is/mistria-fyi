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

  it("denies reads in any segment, fed heredocs, & dynamic targets", () => {
    for (const command of [
      "ls src; cat src/lib/data/tracker-data.json",
      "git status && wc -c < src/lib/data/tracker-data.json",
      "echo <(cat src/lib/data/tracker-data.json)",
      "bash <<'EOF'\njq . src/lib/data/tracker-data.json\nEOF",
      "python3 - <<'EOF'\nprint(open('src/lib/data/tracker-data.json').read())\nEOF",
      "node -e 'readFileSync(\"src/lib/data/tracker-data.json\")'",
      "f=src/lib/data/tracker-data.json; head $f",
      "echo src/lib/data/tracker-data.json | xargs cat",
      "xargs cat <<EOF\nsrc/lib/data/tracker-data.json\nEOF",
      "bash <<'EOF' 2>&1 | tail -20\ncat src/lib/data/tracker-data.json\nEOF",
      "bash <<'EOF' && echo done\nhead -c 100 src/lib/data/tracker-data.json\nEOF",
      "python3 -m json.tool src/lib/data/tracker-data.json | head -50",
      "xxd src/lib/data/tracker-data.json",
      "exec 3<>src/lib/data/tracker-data.json; cat <&3",
      "cat <<'EOF' | bash\ncat src/lib/data/tracker-data.json\nEOF",
      "cat <<'EOF' | python3 -\nopen('src/lib/data/tracker-data.json')\nEOF",
    ]) {
      expect(
        readGuardMessage({ cwd: "/work/mistria", tool_input: { command }, tool_name: "Bash" }),
        command,
      ).toContain("Read src/lib/types");
    }
  });

  it("allows commands whose reads are in segments that never name the data", () => {
    for (const command of [
      "git check-attr linguist-generated src/lib/data/tracker-data.json; python3 - <<'EOF'\nprint(1)\nEOF\nrg -n \"pipeline/output/tracker|minified\" docs",
      "cat >> .gitattributes <<'EOF'\nsrc/lib/data/tracker-data.json linguist-generated=true\nEOF",
      "cat <<EOF\nsrc/lib/data/tracker-data.json\nEOF",
      "git check-attr -a src/lib/data/tracker-data.json; rg -n 'end$' docs",
      "gh pr comment 1 --body-file - <<'EOF'\nopen('src/lib/data/tracker-data.json') failed\nEOF",
      "git log --oneline -- src/lib/data/tracker-data.json | head -5",
      "grep x <<< src/lib/data/tracker-data.json",
      "pnpm exec oxfmt --check src/lib/data/tracker-data.json && cat README.md",
    ]) {
      expect(
        readGuardMessage({ cwd: "/work/mistria", tool_input: { command }, tool_name: "Bash" }),
        command,
      ).toBeUndefined();
    }
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
