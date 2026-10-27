import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { cleanup, parseArgs, systemIo } from "./cleanup-merged-worktrees.js";

import type { CleanupIo, CleanupOptions, CommandResult } from "./cleanup-merged-worktrees.js";

const directories: string[] = [];

afterAll(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

interface FixtureOptions {
  ancestor?: boolean;
  associated?: boolean;
  detached?: boolean;
  dirty?: boolean;
  exact?: boolean;
  exactFailure?: boolean;
  failure?: boolean;
  fetchFailure?: boolean;
  inUse?: boolean;
  localCommit?: boolean;
  locked?: boolean;
  /** The tip is an unpushed merge of `main-parent` (in main) & `pr-parent` (in merged PR #42). */
  merge?: "clean" | "conflicted";
  open?: boolean;
  openAssociation?: boolean;
  openBranch?: boolean;
  openFailure?: boolean;
  prunable?: boolean;
  /** `git worktree prune` succeeds but keeps the registration, as an expiry setting can. */
  pruneKeeps?: boolean;
  unmounted?: boolean;
  unpushed?: boolean;
}

const ok = (stdout = ""): CommandResult => ({ ok: true, stderr: "", stdout });
const failed: CommandResult = { ok: false, stderr: "failed", stdout: "" };
const unknownCommit: CommandResult = {
  ok: false,
  stderr: "gh: No commit found for SHA: tip (HTTP 422)",
  stdout: "",
};

/** Answers `gh` the way GitHub would for the fixture's merged parent PR #42. */
function fakeGh(options: FixtureOptions, mergedTip: string) {
  return (args: string[]): CommandResult => {
    const call = args.join(" ");
    if (call === "--version") {
      return ok("gh version test");
    }
    if (call.startsWith("pr list --head worktree-agent-test --state merged")) {
      if (options.exactFailure) {
        return failed;
      }
      return ok(options.exact ? "42\n" : "");
    }
    if (call.startsWith("pr list --head worktree-agent-test --state open")) {
      if (options.openFailure) {
        return failed;
      }
      return ok(options.openBranch ? "43\n" : "");
    }
    if (
      call.startsWith("api repos/{owner}/{repo}/commits/tip/") &&
      (options.unpushed || options.merge)
    ) {
      return unknownCommit;
    }
    if (call.startsWith("api repos/{owner}/{repo}/commits/")) {
      if (options.failure) {
        return failed;
      }
      return ok(
        `42\tmerged\tparent-branch\n${options.openAssociation ? "43\topen\tother-branch\n" : ""}`,
      );
    }
    if (call.startsWith("api repos/{owner}/{repo}/pulls/42/commits")) {
      return ok(options.associated === false || options.localCommit ? "" : `${mergedTip}\n`);
    }
    if (call.startsWith("pr list --head parent-branch --state open")) {
      return ok(options.open ? "43\n" : "");
    }
    throw new Error(`Unexpected gh call: ${call}`);
  };
}

function capture(io: Omit<CleanupIo, "log" | "logError">) {
  const output = { stderr: "", stdout: "" };
  const run = (options: CleanupOptions) => {
    output.stdout = "";
    output.stderr = "";
    const status = cleanup(options, {
      ...io,
      log: (line) => {
        output.stdout += `${line}\n`;
      },
      logError: (line) => {
        output.stderr += `${line}\n`;
      },
    });
    return { status, ...output };
  };
  return run;
}

const preview: CleanupOptions = { apply: false, idleMinutes: 0 };
const apply: CleanupOptions = { apply: true, idleMinutes: 0 };

// Decision cases answer Git & GitHub from a snapshot. They run the real decision logic but create
// no repositories, query no processes, and perform no destructive operations.
function fixture(options: FixtureOptions = {}) {
  const root = "/virtual/checkout";
  const worktree = "/virtual/agent worktree";
  const state = {
    branchRemoved: false,
    invokedFrom: root,
    leftoversRemoved: "",
    worktreeRemoved: false,
  };
  const git = (args: string[]): CommandResult => {
    const call = args.join(" ");
    switch (call) {
      case "rev-parse --show-toplevel":
        return ok(`${state.invokedFrom}\n`);
      case "branch --show-current":
        return ok(state.invokedFrom === worktree ? "" : "main\n");
      case "symbolic-ref --quiet --short refs/remotes/origin/HEAD":
        return ok("origin/main\n");
      case "fetch --quiet origin refs/heads/main:refs/remotes/origin/main":
        return options.fetchFailure ? failed : ok();
      case "for-each-ref --format=%(refname:short) refs/heads":
        return ok(options.detached ? "main\n" : "main\nworktree-agent-test\n");
      case "worktree list --porcelain": {
        let listing = `worktree ${root}\nHEAD base\nbranch refs/heads/main\n\n`;
        if (!state.worktreeRemoved) {
          listing += `worktree ${worktree}\nHEAD tip\n`;
          listing += options.detached ? "detached\n" : "branch refs/heads/worktree-agent-test\n";
          listing += options.locked ? "locked\n" : "";
          listing += options.prunable
            ? "prunable gitdir file points to non-existent location\n"
            : "";
        }
        return ok(listing);
      }
      case "worktree prune":
        state.worktreeRemoved = !options.locked && !options.pruneKeeps;
        return ok();
      case "rev-list --parents --max-count=1 tip":
        return ok(options.merge ? "tip main-parent pr-parent\n" : "tip parent\n");
      case "merge-base --is-ancestor main-parent refs/remotes/origin/main":
        return ok();
      case "merge-base --is-ancestor pr-parent refs/remotes/origin/main":
        return failed;
      case "merge-tree --write-tree main-parent pr-parent":
        return options.merge === "clean" ? ok("tree\n") : failed;
      case "rev-parse tip^{tree}":
        return ok("tree\n");
      case "rev-parse worktree-agent-test":
        return ok("tip\n");
      case "merge-base --is-ancestor tip refs/remotes/origin/main":
        return options.ancestor ? ok() : failed;
      case `-C ${worktree} status --porcelain`:
        if (options.prunable) {
          return failed;
        }
        return ok(options.dirty ? " M file\n" : "");
      case `-C ${worktree} rev-parse --absolute-git-dir`:
        return ok("/virtual/git\n");
      case `-c core.longpaths=true worktree remove ${worktree}`:
        state.worktreeRemoved = true;
        return ok();
      case "branch -D worktree-agent-test":
        state.branchRemoved = true;
        return ok();
      default:
        throw new Error(`Unexpected git call: ${call}`);
    }
  };
  const run = capture({
    gh: fakeGh(options, options.merge ? "pr-parent" : "tip"),
    git,
    modifiedWithin: () => true,
    processDirectories: () => (options.inUse ? [`${worktree}/src`] : []),
    // Only the worktree's parent resolves, unless the fixture's volume is unmounted.
    realpath: (path) => (path === "/virtual" && !options.unmounted ? path : undefined),
    removeLeftovers: (path) => {
      state.leftoversRemoved = path;
    },
  });
  return {
    run: (runOptions: CleanupOptions = preview) => run(runOptions),
    runAt: (cwd: string, runOptions: CleanupOptions) => {
      state.invokedFrom = cwd;
      return run(runOptions);
    },
    state,
    worktree,
  };
}

function gitFixture(options: FixtureOptions = {}) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "mistria-cleanup-")));
  directories.push(directory);
  const checkout = join(directory, "checkout");
  const worktree = join(directory, "agent worktree");
  const linkTarget = join(directory, "shared");
  mkdirSync(checkout);
  mkdirSync(linkTarget);
  writeFileSync(join(linkTarget, "kept"), "shared\n");
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", checkout, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  git("init", "--initial-branch=main");
  git("config", "user.name", "Cleanup test");
  git("config", "user.email", "cleanup@example.invalid");
  git("config", "commit.gpgsign", "false");
  writeFileSync(join(checkout, "file"), "initial\n");
  // No trailing slash: Git sees a POSIX symlink as a file, so `linked/` wouldn't ignore it.
  writeFileSync(join(checkout, ".gitignore"), "linked\nnode_modules/\n");
  git("add", ".");
  git("commit", "-m", "Initial");
  git("remote", "add", "origin", checkout);
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  git("symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
  git("switch", "-c", "worktree-agent-test");
  writeFileSync(join(checkout, "file"), "candidate commit\n");
  git("commit", "-am", "Candidate");
  const mergedTip = git("rev-parse", "HEAD");
  git("switch", "main");
  git("worktree", "add", worktree, "worktree-agent-test");
  // Links like worktree setup's & pnpm's. Git for Windows deregisters the worktree but leaves
  // directory junctions behind; cleanup must delete them without following them.
  const linkType = process.platform === "win32" ? "junction" : "dir";
  symlinkSync(linkTarget, join(worktree, "linked"), linkType);
  mkdirSync(join(worktree, "node_modules", ".pnpm", "package"), { recursive: true });
  symlinkSync(
    join(worktree, "node_modules", ".pnpm", "package"),
    join(worktree, "node_modules", "package"),
    linkType,
  );
  const ghIo = { ...systemIo(checkout), gh: fakeGh(options, mergedTip) };
  // Process-use decisions are covered by snapshots; this case integrates only real Git.
  const runAt = (cwd: string, runOptions: CleanupOptions) =>
    capture({ ...ghIo, git: systemIo(cwd).git, processDirectories: () => [] })(runOptions);
  return {
    git,
    linkTarget,
    run: (runOptions: CleanupOptions) => runAt(checkout, runOptions),
    runAt,
    worktree,
  };
}

describe("argument parsing", () => {
  it.each([
    [[], { apply: false, idleMinutes: 0 }],
    [["--apply"], { apply: true, idleMinutes: 0 }],
    [["--apply", "--idle-minutes", "120"], { apply: true, idleMinutes: 120 }],
    [["--help"], "help"],
    [["--idle-minutes"], undefined],
    [["--idle-minutes", "soon"], undefined],
    [["--force"], undefined],
  ] as const)("parses %j", (args, expected) => {
    expect(parseArgs([...args])).toEqual(expected);
  });
});

it("integrates preview & apply with one real Git fixture, including linked directories", () => {
  const { git, linkTarget, run, runAt, worktree } = gitFixture();
  expect(run(preview).stdout).toContain(`Would remove worktree ${worktree.replaceAll("\\", "/")}`);
  expect(git("branch", "--list", "worktree-agent-test")).toContain("worktree-agent-test");
  expect(runAt(worktree, apply).status).toBe(0);
  expect(git("worktree", "list")).toContain("agent worktree");
  const result = run(apply);
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain("Removed branch worktree-agent-test (merged PR #42)");
  expect(git("branch", "--list", "worktree-agent-test")).toBe("");
  expect(git("worktree", "list")).not.toContain("agent worktree");
  expect(existsSync(worktree)).toBe(false);
  expect(readFileSync(join(linkTarget, "kept"), "utf8")).toBe("shared\n");
});

describe("merged-worktree cleanup", () => {
  it("finds an agent tip in a merged parent PR without changing anything in preview", () => {
    const { run, state, worktree } = fixture();
    const result = run();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(`Would remove worktree ${worktree}`);
    expect(state.branchRemoved).toBe(false);
  });

  it("removes a clean confirmed worktree and branch when applied", () => {
    const { run, state, worktree } = fixture();
    const result = run(apply);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("Removed branch worktree-agent-test (merged PR #42)");
    expect(state).toMatchObject({
      branchRemoved: true,
      leftoversRemoved: worktree,
      worktreeRemoved: true,
    });
  });

  it("still accepts a branch whose exact tip matches its merged PR", () => {
    expect(fixture({ exact: true }).run().stdout).toContain("Would remove worktree");
  });

  it("requires gh", () => {
    const result = capture({
      gh: () => failed,
      git: () => failed,
      modifiedWithin: () => false,
      processDirectories: () => [],
      realpath: () => undefined,
      removeLeftovers: () => undefined,
    })(apply);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("gh is required");
  });

  it.each([
    [{ associated: false }, "no merged pull request"],
    [{ localCommit: true }, "no merged pull request"],
    [{ dirty: true }, "uncommitted changes"],
    [{ locked: true }, "locked"],
    [{ open: true }, "open pull request"],
    [{ openAssociation: true }, "open pull request"],
    [{ failure: true }, "could not confirm"],
    [{ exactFailure: true }, "could not confirm its merge status"],
    [{ unpushed: true }, "isn't on GitHub, so it holds unpushed work"],
  ] as const)("keeps an unconfirmed or protected branch: %j", (options, message) => {
    const { run, state } = fixture(options);
    const result = run(apply);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout + result.stderr).toContain(message);
    expect(state.branchRemoved).toBe(false);
  });
});

describe("stale worktree registrations", () => {
  it("previews pruning and evaluates the branch as if its worktree were gone", () => {
    const { run, state, worktree } = fixture({ prunable: true });
    const result = run();
    expect(result.stdout).toContain(`Would prune worktree registration ${worktree}`);
    expect(result.stdout).toContain("Would delete branch worktree-agent-test (merged PR #42)");
    expect(state.worktreeRemoved).toBe(false);
  });

  it("prunes the registration, then deletes the merged branch", () => {
    const { run, state, worktree } = fixture({ prunable: true });
    const result = run(apply);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(`Pruned worktree registration ${worktree}`);
    expect(result.stdout).toContain("Removed branch worktree-agent-test (merged PR #42)");
    expect(state).toMatchObject({ branchRemoved: true, leftoversRemoved: "" });
  });

  it.each([{ pruneKeeps: true }, { unmounted: true }])(
    "keeps the branch when the registration survives: %j",
    (options) => {
      const { run, state } = fixture({ ...options, prunable: true });
      const result = run(apply);
      expect(result.stdout).not.toContain("Pruned");
      expect(result.stdout + result.stderr).toContain("could not inspect its status");
      expect(state.branchRemoved).toBe(false);
    },
  );

  it("leaves a locked stale registration alone", () => {
    const { run, state } = fixture({ locked: true, prunable: true });
    const result = run(apply);
    expect(result.stdout).not.toContain("Pruned");
    expect(result.stdout).toContain("locked");
    expect(state.branchRemoved).toBe(false);
  });
});

describe("in-use worktree protection", () => {
  it("keeps a worktree that a running process uses", () => {
    const { run, state } = fixture({ ancestor: true, associated: false, inUse: true });
    const result = run(apply);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("a running process is using it");
    expect(state.worktreeRemoved).toBe(false);
  });

  it("keeps a worktree whose HEAD changed within the idle window", () => {
    const { run, state } = fixture({ ancestor: true, associated: false });
    const result = run({ apply: true, idleMinutes: 60 });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("HEAD changed in the last 60 minutes");
    expect(state.branchRemoved).toBe(false);
  });
});

describe("cleanup of commits already in main", () => {
  it("previews and removes an ancestor branch without requiring a PR commit match", () => {
    const { run, state } = fixture({ ancestor: true, associated: false });
    expect(run().stdout).toContain("reachable from origin/main");
    const result = run(apply);
    expect(result.status, result.stderr).toBe(0);
    expect(state.branchRemoved).toBe(true);
  });

  it.each([
    { dirty: true },
    { locked: true },
    { openBranch: true },
    { openFailure: true },
    { openAssociation: true },
    { open: true },
    { failure: true },
  ])("protects an ancestor: %j", (options) => {
    const { run, state } = fixture({ ...options, ancestor: true, associated: false });
    expect(run(apply).status).toBe(0);
    expect(state.branchRemoved).toBe(false);
  });

  it("does not trust a stale main ref after a failed fetch", () => {
    const { run, state } = fixture({ ancestor: true, associated: false, fetchFailure: true });
    const result = run(apply);
    expect(result.stdout + result.stderr).toContain("could not refresh");
    expect(state.branchRemoved).toBe(false);
  });
});

describe("detached worktree cleanup", () => {
  it.each([{ ancestor: true }, {}])(
    "previews and removes a confirmed detached tip: %j",
    (options) => {
      const { run, state } = fixture({ ...options, detached: true });
      expect(run().stdout).toContain("Would remove detached worktree");
      const result = run(apply);
      expect(result.status, result.stderr).toBe(0);
      expect(state.worktreeRemoved).toBe(true);
    },
  );

  it.each([{ dirty: true }, { locked: true }, { localCommit: true }, { associated: false }])(
    "protects a detached worktree: %j",
    (options) => {
      const { run, state } = fixture({ ...options, detached: true });
      expect(run(apply).status).toBe(0);
      expect(state.worktreeRemoved).toBe(false);
    },
  );

  it("removes a conflict-free local merge whose parents are both merged", () => {
    const { run, state } = fixture({ detached: true, merge: "clean" });
    expect(run().stdout).toContain(
      "conflict-free merge of parents reachable from origin/main & merged PR #42",
    );
    expect(run(apply).status).toBe(0);
    expect(state.worktreeRemoved).toBe(true);
  });

  it.each([
    [{ merge: "conflicted" }, "unpushed work"],
    [{ merge: "clean", open: true }, "open pull request"],
    [{ localCommit: true, merge: "clean" }, "no merged pull request"],
  ] as const)("protects a local merge: %j", (options, message) => {
    const { run, state } = fixture({ ...options, detached: true });
    const result = run(apply);
    expect(result.stdout + result.stderr).toContain(message);
    expect(state.worktreeRemoved).toBe(false);
  });

  it("preserves the invoking detached worktree", () => {
    const { runAt, state, worktree } = fixture({ ancestor: true, detached: true });
    expect(runAt(worktree, apply).status).toBe(0);
    expect(state.worktreeRemoved).toBe(false);
  });

  it.each([{ openAssociation: true }, { open: true }, { failure: true }])(
    "protects an ancestor detached worktree: %j",
    (options) => {
      const { run, state } = fixture({ ...options, ancestor: true, detached: true });
      expect(run(apply).status).toBe(0);
      expect(state.worktreeRemoved).toBe(false);
    },
  );
});
