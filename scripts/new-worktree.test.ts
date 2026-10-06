import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const script = readFileSync(new URL("new-worktree.sh", import.meta.url), "utf8");
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function git(cwd: string, ...args: string[]) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "mistria-worktree-"));
  temporaryDirectories.push(directory);
  const upstream = join(directory, "upstream");
  const checkout = join(directory, "checkout");
  mkdirSync(upstream);
  git(upstream, "init", "--initial-branch=main");
  git(upstream, "config", "user.name", "Worktree test");
  git(upstream, "config", "user.email", "worktree@example.invalid");
  git(upstream, "config", "commit.gpgsign", "false");
  mkdirSync(join(upstream, "scripts"));
  writeFileSync(join(upstream, "scripts/new-worktree.sh"), script);
  writeFileSync(join(upstream, "scripts/setup-worktree.sh"), "#!/bin/bash\nexit 0\n");
  writeFileSync(join(upstream, ".gitignore"), ".worktrees/\n");
  git(upstream, "add", ".");
  git(upstream, "commit", "-m", "Initial fixture");
  execFileSync("git", ["clone", upstream, checkout], { stdio: "pipe" });
  return { checkout, upstream };
}

function advance(upstream: string) {
  writeFileSync(join(upstream, "new-file"), "New upstream commit\n");
  git(upstream, "add", ".");
  git(upstream, "commit", "-m", "Advance upstream");
  return git(upstream, "rev-parse", "HEAD");
}

function create(checkout: string, ...args: string[]) {
  return spawnSync("bash", ["scripts/new-worktree.sh", ...args], {
    cwd: checkout,
    encoding: "utf8",
  });
}

describe("new-worktree starting branch", () => {
  it("fetches new main commits without changing the shared checkout or its local edits", () => {
    const { checkout, upstream } = fixture();
    const oldHead = git(checkout, "rev-parse", "HEAD");
    writeFileSync(join(checkout, ".gitignore"), ".worktrees/\nlocal-edit\n");
    const latest = advance(upstream);
    const result = create(checkout, "123-test");
    expect(result.status, result.stderr).toBe(0);
    expect(git(join(checkout, ".worktrees/123-test"), "rev-parse", "HEAD")).toBe(latest);
    expect(git(checkout, "rev-parse", "HEAD")).toBe(oldHead);
    expect(readFileSync(join(checkout, ".gitignore"), "utf8")).toContain("local-edit");
  });

  it("refreshes an explicit starting branch even with a main-only fetch configuration", () => {
    const { checkout, upstream } = fixture();
    git(upstream, "switch", "-c", "release/test");
    const latest = advance(upstream);
    git(checkout, "config", "remote.origin.fetch", "+refs/heads/main:refs/remotes/origin/main");
    const result = create(checkout, "124-test", "release/test");
    expect(result.status, result.stderr).toBe(0);
    expect(git(join(checkout, ".worktrees/124-test"), "rev-parse", "HEAD")).toBe(latest);
  });

  it("fails before creating a branch when the starting branch cannot be fetched", () => {
    const { checkout } = fixture();
    expect(create(checkout, "125-test", "missing").status).not.toBe(0);
    expect(git(checkout, "branch", "--list", "125-test")).toBe("");
    expect(git(checkout, "worktree", "list", "--porcelain")).not.toContain("125-test");
  });
});
