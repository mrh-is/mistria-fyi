import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { formatEdit, snapshotShellEdit } from "./format-agent-edit.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

function fixture() {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), "agent-format-")));
  roots.push(cwd);
  const git = (...args: string[]) => {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  };
  git("init");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  git("config", "commit.gpgsign", "false");
  git("commit", "--allow-empty", "-m", "base");
  writeFileSync(join(cwd, "a file.ts"), "const a=1");
  writeFileSync(join(cwd, "other.md"), "text");
  return cwd;
}

describe("format after agent edit", () => {
  it("includes edits committed by the Bash invocation, without reformatting unchanged files", () => {
    const cwd = fixture();
    const input = { cwd, tool_name: "Bash", tool_use_id: `commit-${cwd}` };
    snapshotShellEdit(input);
    writeFileSync(join(cwd, "a file.ts"), "const a=3");
    for (const args of [
      ["add", "."],
      ["commit", "-m", "edited"],
    ]) {
      const result = spawnSync("git", args, { cwd, encoding: "utf8" });
      expect(result.status, result.stderr).toBe(0);
    }
    const run = vi.fn(() => ({ output: "", status: 0 }));
    formatEdit(input, run);
    expect(run).toHaveBeenCalledWith(
      ["exec", "oxfmt", "--no-error-on-unmatched-pattern", "--", "a file.ts"],
      cwd,
    );
  });

  it("does not format preexisting changes after a read-only Bash call", () => {
    const cwd = fixture();
    const input = {
      cwd,
      tool_input: { command: "git status --short" },
      tool_name: "Bash",
      tool_use_id: `read-${cwd}`,
    };
    snapshotShellEdit(input);
    const run = vi.fn();
    expect(formatEdit(input, run)).toBeUndefined();
    expect(run).not.toHaveBeenCalled();
  });

  it("formats only files whose contents changed during Bash, including new files", () => {
    const cwd = fixture();
    const input = { cwd, tool_name: "Bash", tool_use_id: `write-${cwd}` };
    snapshotShellEdit(input);
    writeFileSync(join(cwd, "a file.ts"), "const a=2");
    writeFileSync(join(cwd, "new.md"), "new");
    const run = vi.fn(() => ({ output: "", status: 0 }));
    formatEdit(input, run);
    expect(run).toHaveBeenCalledWith(
      ["exec", "oxfmt", "--no-error-on-unmatched-pattern", "--", "a file.ts", "new.md"],
      expect.any(String),
    );
  });

  it("uses the repository root when a file tool starts in a subdirectory", () => {
    const cwd = fixture();
    mkdirSync(join(cwd, "nested"));
    const run = vi.fn(() => ({ output: "", status: 0 }));
    formatEdit({ cwd: join(cwd, "nested"), tool_input: { file_path: "../a file.ts" } }, run);
    expect(run).toHaveBeenCalledWith(
      ["exec", "oxfmt", "--no-error-on-unmatched-pattern", "--", "a file.ts"],
      expect.any(String),
    );
  });

  it("passes paths as separate arguments & formats each surviving patch target", () => {
    const cwd = fixture();
    const run = vi.fn(() => ({ output: "", status: 0 }));
    const message = formatEdit(
      {
        cwd,
        tool_input: {
          command:
            "*** Begin Patch\n*** Update File: a file.ts\n*** Add File: other.md\n*** Delete File: deleted.ts\n*** End Patch",
        },
        tool_name: "apply_patch",
      },
      run,
    );
    expect(message).toBeUndefined();
    expect(run).toHaveBeenCalledWith(
      ["exec", "oxfmt", "--no-error-on-unmatched-pattern", "--", "a file.ts", "other.md"],
      cwd,
    );
  });

  it("returns formatter failures rather than swallowing them", () => {
    const cwd = fixture();
    expect(
      formatEdit({ cwd, tool_input: { file_path: "a file.ts" } }, () => ({
        output: "parse error",
        status: 1,
      })),
    ).toContain("parse error");
  });

  it("ignores outside-worktree paths & nonexistent files", () => {
    const cwd = fixture();
    const run = vi.fn();
    formatEdit({ cwd, tool_input: { file_path: "../outside.ts" } }, run);
    formatEdit({ cwd, tool_input: { file_path: "deleted.ts" } }, run);
    expect(run).not.toHaveBeenCalled();
  });
});
