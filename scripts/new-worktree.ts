// Creates and sets up an isolated agent worktree per AGENTS.md, Worktrees.
// Usage: pnpm run worktree:new <issue-number>-<short-description> [starting-branch]
//
// A Node script so Git for Windows records a Windows-readable gitdir: from `cmd.exe`, `bash` can
// resolve to WSL, whose Git writes `/mnt/c/...` paths that Git for Windows reports as prunable.
import "#scripts/lib/require-pinned-node";

import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const USAGE = "Usage: pnpm run worktree:new <issue-number>-<short-description> [starting-branch]";
const SLUG = /^[0-9]+-[a-z0-9]+(-[a-z0-9]+)*$/;

function git(args: string[], inherit = false): number {
  const result = spawnSync("git", args, { stdio: inherit ? "inherit" : "ignore" });
  return result.status ?? 1;
}

function gitOutput(args: string[]): string {
  return spawnSync("git", args, { encoding: "utf8" }).stdout.trim();
}

function main(args: string[]): number {
  if (args.length === 0 || args.length > 2) {
    console.error(USAGE);
    return 1;
  }
  const [slug = "", startingBranch = "main"] = args;
  if (git(["check-ref-format", `refs/heads/${startingBranch}`]) !== 0) {
    console.error(`error: invalid starting branch: ${startingBranch}`);
    return 1;
  }
  if (!SLUG.test(slug)) {
    console.error(
      `error: slug "${slug}" must look like <issue-number>-<short-description> (lowercase, digits, hyphens).`,
    );
    return 1;
  }
  // Always resolve to the main checkout, even when invoked from inside another worktree.
  // `git worktree list` lists the main worktree first.
  const repoRoot = resolve(
    (gitOutput(["worktree", "list", "--porcelain"]).split("\n")[0] ?? "").replace(/^worktree /, ""),
  );
  const worktreeDir = join(repoRoot, ".worktrees", slug);

  if (git(["-C", repoRoot, "check-ignore", "-q", ".worktrees/placeholder"]) !== 0) {
    console.error("error: .worktrees/ is not gitignored; refusing to create a worktree.");
    return 1;
  }
  if (git(["-C", repoRoot, "show-ref", "--verify", "--quiet", `refs/heads/${slug}`]) === 0) {
    console.error(`error: branch ${slug} already exists.`);
    return 1;
  }
  if (existsSync(worktreeDir)) {
    console.error(`error: ${worktreeDir} already exists.`);
    return 1;
  }

  // Refresh the starting branch before branching, without switching or modifying the main
  // checkout. An explicit refspec also refreshes the remote-tracking ref in narrow-fetch clones.
  const fetched = git(
    [
      "-C",
      repoRoot,
      "fetch",
      "origin",
      `refs/heads/${startingBranch}:refs/remotes/origin/${startingBranch}`,
    ],
    true,
  );
  if (fetched !== 0) {
    return fetched;
  }

  const added = git(
    [
      "-C",
      repoRoot,
      "worktree",
      "add",
      worktreeDir,
      "-b",
      slug,
      "--no-track",
      `origin/${startingBranch}`,
    ],
    true,
  );
  if (added !== 0) {
    return added;
  }

  // Run the new worktree's own copy of the setup script, as it would be run by hand.
  const setup = spawnSync(process.execPath, [join(worktreeDir, "scripts", "setup-worktree.ts")], {
    cwd: worktreeDir,
    stdio: "inherit",
  });
  if (setup.status !== 0) {
    // Remove the half-built worktree & branch.
    console.error(`error: setup failed; removing ${worktreeDir} and branch ${slug}.`);
    git(["-C", repoRoot, "worktree", "remove", "--force", worktreeDir]);
    // Git for Windows leaves junctions (and their parent directories) behind, and can stop on
    // `node_modules` paths past MAX_PATH. `rmSync` unlinks a junction without following it, so the
    // main checkout's shared inputs survive; prune then drops a registration Git couldn't remove.
    rmSync(worktreeDir, { force: true, recursive: true });
    git(["-C", repoRoot, "worktree", "prune"]);
    git(["-C", repoRoot, "branch", "-D", slug]);
    return setup.status ?? 1;
  }

  console.log(`\nWorktree ready: ${worktreeDir} (branch ${slug})`);
  console.log(`cd ${worktreeDir}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
