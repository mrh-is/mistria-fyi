import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import { formatEdit } from "./format-agent-edit.js";

const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
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
  it("silently skips a file edit outside a repository", () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), "agent-format-outside-")));
    roots.push(cwd);
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("format-agent-edit.ts", import.meta.url))],
      {
        cwd,
        encoding: "utf8",
        input: JSON.stringify({
          cwd,
          hook_event_name: "PostToolUse",
          tool_input: { file_path: "a.ts" },
          tool_name: "Edit",
        }),
      },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });

  it("skips unrelated repositories", () => {
    vi.stubEnv("CLAUDE_PROJECT_DIR", fixture());
    const cwd = fixture();
    const run = vi.fn();
    expect(formatEdit({ cwd, tool_input: { file_path: "a file.ts" } }, run)).toBeUndefined();
    expect(run).not.toHaveBeenCalled();
  });

  it("accepts linked worktrees of the project", () => {
    const project = fixture();
    vi.stubEnv("CLAUDE_PROJECT_DIR", project);
    const cwd = join(project, "linked");
    const result = spawnSync("git", ["worktree", "add", "--detach", cwd], {
      cwd: project,
      encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(0);
    writeFileSync(join(cwd, "new.md"), "new");
    const run = vi.fn(() => ({ output: "", status: 0 }));
    formatEdit({ cwd, tool_input: { file_path: "new.md" } }, run);
    expect(run).toHaveBeenCalledWith(
      ["exec", "oxfmt", "--no-error-on-unmatched-pattern", "--", "new.md"],
      cwd,
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

  it("leaves files with unresolved merge conflicts untouched until they are staged", () => {
    const cwd = fixture();
    const git = (...args: string[]) =>
      spawnSync("git", ["-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8" });
    writeFileSync(join(cwd, "list.md"), "- a\n- b\n");
    git("add", ".");
    git("commit", "-m", "list");
    git("checkout", "-b", "other");
    writeFileSync(join(cwd, "list.md"), "- a\n- c\n");
    git("commit", "-am", "other");
    git("checkout", "-");
    writeFileSync(join(cwd, "list.md"), "- a\n- d\n");
    git("commit", "-am", "main");

    expect(git("merge", "other").status).not.toBe(0);
    const run = vi.fn(() => ({ output: "", status: 0 }));
    expect(formatEdit({ cwd, tool_input: { file_path: "list.md" } }, run)).toBeUndefined();
    expect(run).not.toHaveBeenCalled();

    writeFileSync(join(cwd, "list.md"), "- a\n- c\n- d\n");
    git("add", "list.md");
    formatEdit({ cwd, tool_input: { file_path: "list.md" } }, run);
    expect(run).toHaveBeenCalledWith(
      ["exec", "oxfmt", "--no-error-on-unmatched-pattern", "--", "list.md"],
      cwd,
    );
  });

  it("ignores outside-worktree paths & nonexistent files", () => {
    const cwd = fixture();
    const run = vi.fn();
    formatEdit({ cwd, tool_input: { file_path: "../outside.ts" } }, run);
    formatEdit({ cwd, tool_input: { file_path: "deleted.ts" } }, run);
    expect(run).not.toHaveBeenCalled();
  });
});
