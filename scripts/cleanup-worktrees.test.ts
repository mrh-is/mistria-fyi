import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const script = new URL("cleanup-worktrees.sh", import.meta.url).pathname;
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function gitIn(cwd: string, ...args: string[]) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function commit(cwd: string, message: string) {
  writeFileSync(join(cwd, "file"), message);
  gitIn(cwd, "add", ".");
  gitIn(
    cwd,
    "-c",
    "user.name=t",
    "-c",
    "user.email=t@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-qm",
    message,
  );
}

/** A primary checkout, plus a `gh` stub that answers `pr list --head <branch>` from `prs`. */
function fixture() {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "mistria-cleanup-")));
  directories.push(directory);
  const primary = join(directory, "primary");
  const bin = join(directory, "bin");
  const prs = join(directory, "prs");
  mkdirSync(primary);
  mkdirSync(bin);
  mkdirSync(prs);
  gitIn(primary, "init", "-q", "--initial-branch=main");
  writeFileSync(join(primary, ".gitignore"), "/.worktrees/\n");
  commit(primary, "base");
  writeFileSync(
    join(bin, "gh"),
    `#!/usr/bin/env bash\nwhile [ $# -gt 0 ]; do [ "$1" = --head ] && cat "${prs}/$2" 2>/dev/null; shift; done\nexit 0\n`,
  );
  chmodSync(join(bin, "gh"), 0o755);

  /** A linked worktree on its own branch with one commit, & the PR state the stub reports. */
  const worktree = (
    branch: string,
    state?: "CLOSED" | "MERGED" | "OPEN",
    { headMatches = true, path = join(directory, branch) } = {},
  ) => {
    gitIn(primary, "worktree", "add", "-q", "-b", branch, path);
    commit(path, branch);
    const head = headMatches ? gitIn(path, "rev-parse", "HEAD") : "0".repeat(40);
    if (state) writeFileSync(join(prs, branch), `${state} ${head}\n`);
    return path;
  };
  const run = (args: string[] = [], idleMinutes = "0") =>
    spawnSync("bash", [script, ...args], {
      cwd: primary,
      encoding: "utf8",
      env: {
        ...process.env,
        MISTRIA_CLEANUP_IDLE_MINUTES: idleMinutes,
        PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
      },
    });
  const branches = () => gitIn(primary, "branch", "--format=%(refname:short)").split("\n");
  return { branches, primary, run, worktree };
}

describe.skipIf(process.platform === "win32")("worktree cleanup", () => {
  it("only previews without --apply", () => {
    const { run, worktree } = fixture();
    const path = worktree("done", "MERGED");
    const result = run();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`would remove ${path} (done, PR MERGED)`);
    expect(existsSync(path)).toBe(true);
  });

  it("removes every finished worktree & its branch, and keeps the primary checkout", () => {
    const { branches, primary, run, worktree } = fixture();
    const merged = worktree("merged", "MERGED");
    const closed = worktree("closed", "CLOSED");
    const result = run(["--apply"]);
    expect(result.status).toBe(0);
    expect(existsSync(merged)).toBe(false);
    expect(existsSync(closed)).toBe(false);
    expect(existsSync(primary)).toBe(true);
    expect(branches()).toEqual(["main"]);
  });

  it("keeps worktrees with an open PR, no PR, or uncommitted changes", () => {
    const { run, worktree } = fixture();
    const open = worktree("open", "OPEN");
    const none = worktree("none");
    const dirty = worktree("dirty", "MERGED");
    writeFileSync(join(dirty, "notes.txt"), "draft");
    const result = run(["--apply"]);
    expect(result.stdout).toContain(`keep ${open}: PR OPEN`);
    expect(result.stdout).toContain(`keep ${none}: PR not found`);
    expect(result.stdout).toContain(`keep ${dirty}: uncommitted changes`);
    for (const path of [open, none, dirty]) expect(existsSync(path)).toBe(true);
  });

  it("keeps a worktree that holds another worktree in an ignored folder", () => {
    const { run, worktree } = fixture();
    const outer = worktree("outer", "MERGED");
    const inner = worktree("inner", "OPEN", { path: join(outer, ".worktrees", "inner") });
    expect(run(["--apply"]).stdout).toContain(`keep ${outer}: holds another worktree`);
    expect(existsSync(inner)).toBe(true);
  });

  it("keeps recently active worktrees", () => {
    const { run, worktree } = fixture();
    const path = worktree("recent", "MERGED");
    expect(run(["--apply"], "120").stdout).toContain(`keep ${path}: active recently`);
    expect(existsSync(path)).toBe(true);
  });

  it("keeps a branch whose tip isn't the PR head, so unpushed commits survive", () => {
    const { branches, run, worktree } = fixture();
    const path = worktree("unpushed", "MERGED", { headMatches: false });
    run(["--apply"]);
    expect(existsSync(path)).toBe(false);
    expect(branches()).toContain("unpushed");
  });
});
