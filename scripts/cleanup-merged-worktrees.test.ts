import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const script = readFileSync(new URL("cleanup-merged-worktrees.sh", import.meta.url), "utf8");
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function fixture(
  options: {
    associated?: boolean;
    dirty?: boolean;
    exact?: boolean;
    failure?: boolean;
    localCommit?: boolean;
    locked?: boolean;
    open?: boolean;
    openAssociation?: boolean;
  } = {},
) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "mistria-cleanup-")));
  directories.push(directory);
  const checkout = join(directory, "checkout");
  const worktree = join(directory, "agent worktree");
  const bin = join(directory, "bin");
  mkdirSync(checkout);
  mkdirSync(bin);
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", checkout, ...args], { encoding: "utf8" }).trim();
  git("init", "--initial-branch=main");
  git("config", "user.name", "Cleanup test");
  git("config", "user.email", "cleanup@example.invalid");
  git("config", "commit.gpgsign", "false");
  writeFileSync(join(checkout, "file"), "initial\n");
  git("add", ".");
  git("commit", "-m", "Initial");
  git("branch", "worktree-agent-test");
  git("worktree", "add", worktree, "worktree-agent-test");
  const mergedTip = git("rev-parse", "HEAD");
  if (options.localCommit) {
    writeFileSync(join(worktree, "file"), "new unmerged commit\n");
    execFileSync("git", ["-C", worktree, "commit", "-am", "After merge"], { stdio: "pipe" });
  }
  if (options.locked) {
    git("worktree", "lock", worktree);
  }
  if (options.dirty) {
    writeFileSync(join(worktree, "file"), "local edits\n");
  }
  writeFileSync(
    join(bin, "gh"),
    `#!/usr/bin/env bash
case "$*" in
  'pr list --head worktree-agent-test --state merged'*) ${options.exact ? "echo 42" : ":"} ;;
  'pr list --head worktree-agent-test --state open'*) : ;;
  'api repos/{owner}/{repo}/commits/'*) ${options.failure ? "exit 1" : String.raw`printf '42\tmerged\tparent-branch\n'`}${options.openAssociation ? String.raw`; printf '43\topen\tother-branch\n'` : ""} ;;
  'api repos/{owner}/{repo}/pulls/42/commits'*) ${options.associated === false ? ":" : `echo ${mergedTip}`} ;;
  'pr list --head parent-branch --state open'*) ${options.open ? "echo 43" : ":"} ;;
  *) echo "Unexpected gh call: $*" >&2; exit 1 ;;
esac
`,
  );
  chmodSync(join(bin, "gh"), 0o755);
  const run = (...args: string[]) =>
    spawnSync("bash", ["-c", script, "cleanup", ...args], {
      cwd: checkout,
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` },
    });
  return { git, run, worktree };
}

describe("merged-worktree cleanup", () => {
  it("finds an agent tip in a merged parent PR without changing anything in preview", () => {
    const { git, run, worktree } = fixture();
    const result = run();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(`Would remove worktree ${worktree}`);
    expect(git("branch", "--list", "worktree-agent-test")).toContain("worktree-agent-test");
  });

  it("removes a clean confirmed worktree and branch when applied", () => {
    const { git, run } = fixture();
    const result = run("--apply");
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("Removed branch worktree-agent-test (merged PR #42)");
    expect(git("branch", "--list", "worktree-agent-test")).toBe("");
    expect(git("worktree", "list")).not.toContain("agent worktree");
  });

  it("still accepts a branch whose exact tip matches its merged PR", () => {
    expect(fixture({ exact: true }).run().stdout).toContain("Would remove worktree");
  });

  it.each([
    [{ associated: false }, "no merged pull request"],
    [{ localCommit: true }, "no merged pull request"],
    [{ dirty: true }, "uncommitted changes"],
    [{ locked: true }, "Git refused"],
    [{ open: true }, "open pull request"],
    [{ openAssociation: true }, "open pull request"],
    [{ failure: true }, "could not confirm"],
  ] as const)("keeps an unconfirmed or protected branch: %j", (options, message) => {
    const { git, run } = fixture(options);
    const result = run("--apply");
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout + result.stderr).toContain(message);
    expect(git("branch", "--list", "worktree-agent-test")).toContain("worktree-agent-test");
  });
});
