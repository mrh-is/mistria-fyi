// Previews or removes local branches & worktrees whose work has merged. Run without arguments to
// preview the changes; see `usage` below and docs/development-workflow.md.
//
// A Node script rather than Bash so it behaves the same on Windows (#727), where `bash` from
// `cmd.exe` can resolve to WSL, and where `git worktree remove` deregisters a worktree but leaves
// its junctions & pnpm's `node_modules` links behind.
import "#scripts/lib/require-pinned-node";

import { spawnSync } from "node:child_process";
import { existsSync, realpathSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import { isInside } from "#scripts/lib/paths";
import { windowsProcessPaths } from "#scripts/lib/windows-process-paths";

export const usage = `Usage: pnpm run worktree:cleanup [-- --apply] [--idle-minutes <minutes>]

Preview or remove local branches and detached worktrees whose tip is reachable from the freshly
fetched origin default branch, or is confirmed in a merged GitHub pull request. Associated
worktrees are removed first, but only when clean, unlocked, and not in use.

Without --apply, the script only reports what it would remove. It never removes branches with an
open pull request, branches with local commits after the merged pull request, dirty worktrees, or
worktrees that Git refuses to remove. The invoking and primary worktrees are always preserved.
If refreshing the default branch fails, only GitHub PR evidence is used.

Unlocked registrations whose worktree directory no longer exists are pruned first, so their
branches get the same checks as any other. A detached or branch tip that is a conflict-free merge
of two commits counts as merged when both of its parents do.

A worktree is in use when a running process's working directory is inside it (via lsof), or
on Windows when an executable or command-line path references it, or, with --idle-minutes,
when its HEAD changed within that many
minutes. A fresh agent worktree's tip is already in the default branch, so unattended runs need
this guard to spare live sessions.`;

export interface CleanupOptions {
  apply: boolean;
  idleMinutes: number;
}

export interface CommandResult {
  ok: boolean;
  stderr: string;
  stdout: string;
}

const failed: CommandResult = { ok: false, stderr: "", stdout: "" };

/** Side effects, injectable for tests. */
export interface CleanupIo {
  gh: (args: string[]) => CommandResult;
  git: (args: string[]) => CommandResult;
  log: (line: string) => void;
  logError: (line: string) => void;
  /** Whether any of these files changed within the last `minutes`. */
  modifiedWithin: (paths: string[], minutes: number) => boolean;
  /** Process working directories or Windows absolute argument paths; undefined if unavailable. */
  processDirectories: () => string[] | undefined;
  realpath: (path: string) => string | undefined;
  /** Deletes what's left of a deregistered worktree directory, without following links. */
  removeLeftovers: (path: string) => void;
}

interface WorktreeEntry {
  branch?: string;
  detached: boolean;
  head?: string;
  locked?: string;
  path: string;
  prunable?: boolean;
}

interface AssociatedPr {
  branch: string;
  number: string;
  state: string;
}

type MergedPrLookup =
  | { kind: "failed" }
  | { kind: "merged"; number: string }
  | { kind: "none" }
  | { kind: "protected" }
  | { kind: "unpushed" };

const ASSOCIATED_PRS_JQ =
  '.[] | [.number, (if .merged_at != null then "merged" else .state end), .head.ref] | @tsv';

/** Returns the options, `"help"`, or `undefined` for invalid arguments. */
export function parseArgs(args: string[]): "help" | CleanupOptions | undefined {
  const options: CleanupOptions = { apply: false, idleMinutes: 0 };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--idle-minutes") {
      const value = args[index + 1] ?? "";
      if (!/^\d+$/u.test(value)) {
        return undefined;
      }
      options.idleMinutes = Number(value);
      index += 1;
    } else if (arg === "-h" || arg === "--help") {
      return "help";
    } else {
      return undefined;
    }
  }
  return options;
}

export function parseWorktrees(porcelain: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = [];
  let entry: undefined | WorktreeEntry;
  for (const line of porcelain.split(/\r?\n/u)) {
    if (line.startsWith("worktree ")) {
      entry = { detached: false, path: line.slice("worktree ".length) };
      entries.push(entry);
    } else if (!entry) {
      continue;
    } else if (line.startsWith("HEAD ")) {
      entry.head = line.slice("HEAD ".length);
    } else if (line.startsWith("branch refs/heads/")) {
      entry.branch = line.slice("branch refs/heads/".length);
    } else if (line === "detached") {
      entry.detached = true;
    } else if (line.startsWith("locked")) {
      entry.locked = line;
    } else if (line.startsWith("prunable")) {
      entry.prunable = true;
    }
  }
  return entries;
}

/** An unlocked registration whose directory is gone, which `git worktree prune` removes. */
function isStale(entry: WorktreeEntry): boolean {
  return entry.prunable === true && !entry.locked;
}

function parseAssociatedPrs(output: string): AssociatedPr[] {
  return output
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => {
      const [number = "", state = "", branch = ""] = line.split("\t");
      return { branch, number, state };
    });
}

export function cleanup(options: CleanupOptions, io: CleanupIo): number {
  const text = (args: string[]) => io.git(args).stdout.trim();

  if (!io.gh(["--version"]).ok) {
    io.logError("gh is required to confirm pull-request merge status.");
    return 1;
  }
  const toplevel = io.git(["rev-parse", "--show-toplevel"]);
  if (!toplevel.ok) {
    io.logError("Run this inside a Git checkout.");
    return 1;
  }
  const repositoryRoot = toplevel.stdout.trim();
  const currentBranch = text(["branch", "--show-current"]);
  const defaultRef = io.git(["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
  const defaultBranch = defaultRef.ok ? defaultRef.stdout.trim().replace(/^origin\//u, "") : "";
  // A preview treats stale registrations as already pruned, so it reports what --apply would do.
  // After a real prune, the listing itself shows whatever Git kept.
  let previewHidesStale = false;
  const listWorktrees = () =>
    parseWorktrees(io.git(["worktree", "list", "--porcelain"]).stdout).filter(
      (entry) => !previewHidesStale || !isStale(entry),
    );
  const primaryWorktree = listWorktrees()[0]?.path;
  let ancestryAvailable = false;
  if (defaultBranch) {
    const refspec = `refs/heads/${defaultBranch}:refs/remotes/origin/${defaultBranch}`;
    if (io.git(["fetch", "--quiet", "origin", refspec]).ok) {
      ancestryAvailable = true;
    } else {
      io.logError(
        `Warning: could not refresh origin/${defaultBranch}; using only confirmed PR evidence.`,
      );
    }
  }

  // Git prunes every unlocked registration whose directory is gone; branches stay for the checks
  // below. A missing parent directory suggests an unmounted volume whose worktree may still hold
  // uncommitted work, and prune can't spare one entry, so such an entry blocks pruning entirely.
  const stale = listWorktrees().filter((entry) => isStale(entry));
  const unreachable = stale.filter((entry) => io.realpath(dirname(entry.path)) === undefined);
  if (unreachable.length > 0) {
    for (const entry of unreachable) {
      io.logError(
        `Not pruning worktree registrations: ${entry.path}'s parent directory is missing, so it ` +
          "may be on an unmounted volume. Lock it with `git worktree lock`, or prune by hand.",
      );
    }
  } else if (stale.length > 0 && !options.apply) {
    for (const entry of stale) {
      io.log(`Would prune worktree registration ${entry.path}: its directory is gone.`);
    }
    previewHidesStale = true;
  } else if (stale.length > 0) {
    if (!io.git(["worktree", "prune"]).ok) {
      io.logError("Warning: git worktree prune failed; stale registrations remain.");
    }
    const remaining = new Set(listWorktrees().map((entry) => entry.path));
    for (const entry of stale) {
      if (!remaining.has(entry.path)) {
        io.log(`Pruned worktree registration ${entry.path}: its directory was gone.`);
      }
    }
  }

  const processDirectories = io.processDirectories();
  if (!processDirectories) {
    io.log(
      "Note: can't list running processes' working directories here, so only the invoking " +
        "worktree and --idle-minutes protect live sessions.",
    );
  }

  const worktreeIsInUse = (target: string): boolean => {
    const realTarget = io.realpath(target) ?? target;
    if (
      processDirectories?.some(
        (directory) => isInside(directory, target) || isInside(directory, realTarget),
      )
    ) {
      io.log(`Keeping worktree ${target}: a running process is using it.`);
      return true;
    }
    // HEAD and its reflog change on checkout and commit. The index can't serve: the `git status`
    // in worktreeIsSafe rewrites it, so every run would refresh its own idle window.
    if (options.idleMinutes > 0) {
      const gitDirectory = io.git(["-C", target, "rev-parse", "--absolute-git-dir"]);
      if (gitDirectory.ok) {
        const directory = gitDirectory.stdout.trim();
        if (
          io.modifiedWithin(
            [join(directory, "HEAD"), join(directory, "logs", "HEAD")],
            options.idleMinutes,
          )
        ) {
          io.log(
            `Keeping worktree ${target}: its HEAD changed in the last ${String(options.idleMinutes)} minutes.`,
          );
          return true;
        }
      }
    }
    return false;
  };

  const worktreeIsSafe = (target: string): boolean => {
    if (target === repositoryRoot || target === primaryWorktree) {
      io.log(`Keeping worktree ${target}: it is the invoking or primary worktree.`);
      return false;
    }
    if (worktreeIsInUse(target)) {
      return false;
    }
    const locked = listWorktrees().find((entry) => entry.path === target)?.locked;
    if (locked) {
      io.log(`Keeping worktree ${target}: it is locked (${locked}).`);
      return false;
    }
    const status = io.git(["-C", target, "status", "--porcelain"]);
    if (!status.ok) {
      io.logError(`Keeping worktree ${target}: could not inspect its status.`);
      return false;
    }
    if (status.stdout.trim()) {
      io.log(`Keeping worktree ${target}: it has uncommitted changes.`);
      return false;
    }
    return true;
  };

  const tipIsInDefaultBranch = (commit: string) =>
    ancestryAvailable &&
    io.git(["merge-base", "--is-ancestor", commit, `refs/remotes/origin/${defaultBranch}`]).ok;

  /** PRs associated with `commit`, `"unpushed"` if GitHub lacks it, or `undefined` on failure. */
  const associatedPrs = (commit: string): "unpushed" | AssociatedPr[] | undefined => {
    const result = io.gh([
      "api",
      `repos/{owner}/{repo}/commits/${commit}/pulls`,
      "--paginate",
      "--jq",
      ASSOCIATED_PRS_JQ,
    ]);
    if (result.ok) {
      return parseAssociatedPrs(result.stdout);
    }
    // GitHub answers HTTP 422 for a commit it has never received.
    return /No commit found/u.test(result.stderr + result.stdout) ? "unpushed" : undefined;
  };

  /** The open PR number for a head branch, `""` for none, or `undefined` if GitHub failed. */
  const openPrForBranch = (branch: string): string | undefined => {
    const result = io.gh([
      "pr",
      "list",
      "--head",
      branch,
      "--state",
      "open",
      "--limit",
      "1",
      "--json",
      "number",
      "--jq",
      ".[].number",
    ]);
    return result.ok ? result.stdout.trim() : undefined;
  };

  const commitHasNoOpenPr = (commit: string, label: string): boolean => {
    const prs = associatedPrs(commit);
    if (!prs) {
      io.logError(`Skipping ${label}: GitHub could not confirm its open pull requests.`);
      return false;
    }
    if (prs === "unpushed") {
      return true;
    }
    for (const pr of prs) {
      if (pr.state === "open") {
        io.logError(
          `Keeping ${label}: its commit is associated with open pull request #${pr.number}.`,
        );
        return false;
      }
      if (pr.state !== "merged") {
        continue;
      }
      const openPr = openPrForBranch(pr.branch);
      if (openPr === undefined) {
        io.logError(
          `Skipping ${label}: GitHub could not confirm its parent branch open pull requests.`,
        );
        return false;
      }
      if (openPr) {
        io.logError(
          `Keeping ${label}: parent branch ${pr.branch} has open pull request #${openPr}.`,
        );
        return false;
      }
    }
    return true;
  };

  const mergedPrForCommit = (commit: string, label: string): MergedPrLookup => {
    const prs = associatedPrs(commit);
    if (!prs) {
      return { kind: "failed" };
    }
    if (prs === "unpushed") {
      return { kind: "unpushed" };
    }
    const open = prs.find((pr) => pr.state === "open");
    if (open) {
      io.logError(
        `Keeping ${label}: its commit is associated with open pull request #${open.number}.`,
      );
      return { kind: "protected" };
    }
    // Commit associations can include PRs that merely have this commit in their base history.
    // Require membership in the PR's actual commit list before accepting a merged association.
    for (const pr of prs) {
      if (!pr.number || pr.state !== "merged") {
        continue;
      }
      const commits = io.gh([
        "api",
        `repos/{owner}/{repo}/pulls/${pr.number}/commits`,
        "--paginate",
        "--jq",
        ".[].sha",
      ]);
      if (!commits.ok) {
        return { kind: "failed" };
      }
      if (!commits.stdout.split(/\r?\n/u).includes(commit)) {
        continue;
      }
      const openPr = openPrForBranch(pr.branch);
      if (openPr === undefined) {
        return { kind: "failed" };
      }
      if (openPr) {
        io.logError(
          `Keeping ${label}: parent branch ${pr.branch} has open pull request #${openPr}.`,
        );
        return { kind: "protected" };
      }
      return { kind: "merged", number: pr.number };
    }
    return { kind: "none" };
  };

  /**
   * Why `commit` counts as merged, or `undefined` (with the reason logged) if it doesn't.
   * `exactMatch` returns a merged PR whose head is exactly `commit`, `""` for none, or
   * `undefined` when GitHub couldn't answer.
   */
  const mergedReason = (
    commit: string,
    label: string,
    exactMatch: () => string | undefined = () => "",
  ): string | undefined => {
    if (tipIsInDefaultBranch(commit)) {
      return commitHasNoOpenPr(commit, label)
        ? `reachable from origin/${defaultBranch}`
        : undefined;
    }
    const exact = exactMatch();
    if (exact === undefined) {
      io.logError(`Skipping ${label}: GitHub could not confirm its merge status.`);
      return undefined;
    }
    if (exact) {
      return `merged PR #${exact}`;
    }
    const lookup = mergedPrForCommit(commit, label);
    switch (lookup.kind) {
      case "merged":
        return `merged PR #${lookup.number}`;
      case "none":
        io.log(`Keeping ${label}: its current commit has no merged pull request.`);
        return undefined;
      case "failed":
        io.logError(`Skipping ${label}: GitHub could not confirm its merge status.`);
        return undefined;
      case "protected":
        return undefined;
      case "unpushed":
        return mergeOfMergedParents(commit, label);
    }
  };

  /**
   * Accepts a local merge (often of the default branch into a PR head) when Git can recreate its
   * tree without conflicts, so it adds nothing beyond its parents, and both parents count as merged.
   */
  const mergeOfMergedParents = (commit: string, label: string): string | undefined => {
    const parents = text(["rev-list", "--parents", "--max-count=1", commit]).split(" ").slice(1);
    const [first, second] = parents;
    const recreated =
      first && second ? io.git(["merge-tree", "--write-tree", first, second]) : failed;
    const tree = text(["rev-parse", `${commit}^{tree}`]);
    if (parents.length !== 2 || !recreated.ok || recreated.stdout.split(/\r?\n/u)[0] !== tree) {
      io.log(`Keeping ${label}: its current commit isn't on GitHub, so it holds unpushed work.`);
      return undefined;
    }
    const reasons: string[] = [];
    for (const parent of parents) {
      const reason = mergedReason(parent, label);
      if (!reason) {
        return undefined;
      }
      reasons.push(reason);
    }
    return `conflict-free merge of parents ${reasons.join(" & ")}`;
  };

  /** Removes a worktree, then deletes the links Git for Windows leaves behind. */
  const removeWorktree = (path: string): boolean => {
    // Without long paths, Git for Windows stops inside deep `node_modules` trees.
    const result = io.git(["-c", "core.longpaths=true", "worktree", "remove", path]);
    if (!result.ok) {
      if (result.stderr.trim()) {
        io.logError(result.stderr.trim());
      }
      return false;
    }
    try {
      io.removeLeftovers(path);
    } catch (error) {
      io.logError(
        `Git removed worktree ${path}, but its leftover files remain: ${(error as Error).message}`,
      );
    }
    return true;
  };

  const branches = text(["for-each-ref", "--format=%(refname:short)", "refs/heads"])
    .split(/\r?\n/u)
    .filter(Boolean);
  for (const branch of branches) {
    if (branch === currentBranch) {
      io.log(`Skipping current branch: ${branch}`);
      continue;
    }
    if (defaultBranch && branch === defaultBranch) {
      io.log(`Skipping default branch: ${branch}`);
      continue;
    }

    const headOid = text(["rev-parse", branch]);
    const worktreePath = listWorktrees().find((entry) => entry.branch === branch)?.path;
    if (worktreePath && !worktreeIsSafe(worktreePath)) {
      continue;
    }
    const openPr = openPrForBranch(branch);
    if (openPr === undefined) {
      io.logError(
        `Skipping ${branch}: GitHub could not confirm whether it has an open pull request.`,
      );
      continue;
    }
    if (openPr) {
      io.log(`Keeping ${branch}: it has open pull request #${openPr}.`);
      continue;
    }

    const reason = mergedReason(headOid, branch, () => {
      const result = io.gh([
        "pr",
        "list",
        "--head",
        branch,
        "--state",
        "merged",
        "--limit",
        "100",
        "--json",
        "number,headRefOid",
        "--jq",
        `.[] | select(.headRefOid == "${headOid}") | .number`,
      ]);
      return result.ok ? (result.stdout.trim().split(/\r?\n/u)[0] ?? "") : undefined;
    });
    if (!reason) {
      continue;
    }

    if (!options.apply) {
      io.log(
        worktreePath
          ? `Would remove worktree ${worktreePath} and branch ${branch} (${reason}).`
          : `Would delete branch ${branch} (${reason}).`,
      );
      continue;
    }
    if (worktreePath && !removeWorktree(worktreePath)) {
      io.logError(`Keeping ${branch}: Git refused to remove worktree ${worktreePath}.`);
      continue;
    }
    const deleted = io.git(["branch", "-D", branch]);
    if (!deleted.ok) {
      io.logError(`Could not delete branch ${branch}: ${deleted.stderr.trim()}`);
      continue;
    }
    io.log(`Removed branch ${branch} (${reason}).`);
  }

  // Detached worktrees have no refs/heads entry, so the branch loop never sees them.
  for (const entry of listWorktrees()) {
    if (!entry.detached || !entry.head) {
      continue;
    }
    const label = `detached worktree ${entry.path}`;
    if (!worktreeIsSafe(entry.path)) {
      continue;
    }
    const reason = mergedReason(entry.head, label);
    if (!reason) {
      continue;
    }
    if (!options.apply) {
      io.log(`Would remove detached worktree ${entry.path} (${reason}).`);
    } else if (removeWorktree(entry.path)) {
      io.log(`Removed detached worktree ${entry.path} (${reason}).`);
    } else {
      io.logError(`Keeping detached worktree ${entry.path}: Git refused to remove it.`);
    }
  }
  return 0;
}

export function systemIo(cwd = process.cwd()): CleanupIo {
  const run = (command: string, args: string[]): CommandResult => {
    const result = spawnSync(command, args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    return {
      ok: !result.error && result.status === 0,
      stderr: result.stderr ?? result.error?.message ?? "",
      stdout: result.stdout ?? "",
    };
  };
  return {
    gh: (args) => run("gh", args),
    git: (args) => run("git", args),
    log: (line) => {
      console.log(line);
    },
    logError: (line) => {
      console.error(line);
    },
    modifiedWithin: (paths, minutes) =>
      paths.some((path) => {
        try {
          return Date.now() - statSync(path).mtimeMs < minutes * 60_000;
        } catch {
          return false;
        }
      }),
    processDirectories: () => {
      if (process.platform === "win32") {
        const result = run("powershell.exe", [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "$ErrorActionPreference = 'Stop'; ConvertTo-Json -Compress -InputObject @(Get-CimInstance Win32_Process | Select-Object ExecutablePath, CommandLine)",
        ]);
        return result.ok ? windowsProcessPaths(result.stdout) : undefined;
      }
      if (!process.getuid) {
        return undefined;
      }
      // lsof exits nonzero when some processes can't be inspected; their peers still count.
      const result = spawnSync("lsof", ["-a", "-d", "cwd", "-u", String(process.getuid()), "-Fn"], {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      });
      if (result.error) {
        return undefined;
      }
      return result.stdout
        .split("\n")
        .filter((line) => line.startsWith("n"))
        .map((line) => line.slice(1));
    },
    realpath: (path) => {
      try {
        return realpathSync(path);
      } catch {
        return undefined;
      }
    },
    removeLeftovers: (path) => {
      // `rm` uses lstat, so it unlinks junctions & symlinks rather than following them.
      if (existsSync(path)) {
        rmSync(path, { force: true, recursive: true });
      }
    },
  };
}

function main(args: string[]): number {
  const options = parseArgs(args);
  if (options === "help") {
    console.log(usage);
    return 0;
  }
  if (!options) {
    console.error(usage);
    return 2;
  }
  return cleanup(options, systemIo());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
