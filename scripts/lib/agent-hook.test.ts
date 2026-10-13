import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";

import { changedFiles } from "./agent-hook.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

it("collects committed branch, staged, unstaged, & untracked paths without deleted or ignored files", () => {
  const cwd = mkdtempSync(join(tmpdir(), "agent-changes-"));
  roots.push(cwd);
  const git = (...args: string[]) => {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  };
  git("init");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  git("config", "commit.gpgsign", "false");
  writeFileSync(join(cwd, "base.ts"), "base");
  writeFileSync(join(cwd, ".gitignore"), "ignored.ts\n");
  git("add", ".");
  git("commit", "-m", "base");
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  writeFileSync(join(cwd, "branch.ts"), "committed");
  git("add", "branch.ts");
  git("commit", "-m", "branch");
  writeFileSync(join(cwd, "staged.ts"), "staged");
  git("add", "staged.ts");
  const untracked = process.platform === "win32" ? "a file.ts" : "a\nfile.ts";
  writeFileSync(join(cwd, untracked), "untracked");
  writeFileSync(join(cwd, "ignored.ts"), "ignored");
  rmSync(join(cwd, "base.ts"));
  expect(changedFiles(cwd, true)).toEqual([untracked, "branch.ts", "staged.ts"]);
  expect(changedFiles(cwd)).toEqual([untracked, "staged.ts"]);
  mkdirSync(join(cwd, "nested"));
  expect(changedFiles(join(cwd, "nested"), true)).toEqual([untracked, "branch.ts", "staged.ts"]);
});

it("reports Git enumeration failures instead of treating them as a clean checkout", () => {
  const cwd = mkdtempSync(join(tmpdir(), "agent-no-git-"));
  roots.push(cwd);
  expect(() => changedFiles(cwd)).toThrow(/not a git repository/i);
});
