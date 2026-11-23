import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
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

function commit(cwd: string, message: string, date = "") {
  writeFileSync(join(cwd, "file"), message);
  gitIn(cwd, "add", ".");
  const env = date
    ? { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }
    : undefined;
  execFileSync(
    "git",
    [
      "-C",
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
    ],
    { env },
  );
}

/** A primary checkout, plus a `gh` stub that answers `pr list --head <branch>` from `prs`. */
function fixture() {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "mistria-cleanup-")));
  directories.push(directory);
  const primary = join(directory, "primary");
  const origin = join(directory, "origin.git");
  const bin = join(directory, "bin");
  const prs = join(directory, "prs");
  mkdirSync(primary);
  mkdirSync(bin);
  mkdirSync(prs);
  gitIn(primary, "init", "-q", "--initial-branch=main");
  gitIn(directory, "init", "-q", "--bare", origin);
  gitIn(primary, "remote", "add", "origin", origin);
  writeFileSync(join(primary, ".gitignore"), "/.worktrees/\n");
  commit(primary, "base");
  gitIn(primary, "push", "-q", "origin", "main");
  writeFileSync(
    join(bin, "gh"),
    // It drains stdin first, as the real gh can, so a missing `</dev/null` loses later worktrees.
    `#!/usr/bin/env bash
cat >/dev/null
if [ "$1" = api ]; then
  [ ! -f "${prs}/finished" ] || cat "${prs}/finished"
  for record in "${prs}"/*; do
    case "\${record##*/}" in broken | finished) continue ;; esac
    [ -f "$record" ] || continue
    read -r state tip <"$record"
    printf '99 %s %s %s\n' "$tip" "$state" "\${record##*/}"
  done
  exit 0
fi
while [ $# -gt 0 ]; do
  [ "$1" = --head ] && [ "$2" = broken ] && { echo "gh: HTTP 502" >&2; exit 1; }
  [ "$1" = --head ] && cat "${prs}/$2" 2>/dev/null
  shift
done
exit 0
`,
  );
  chmodSync(join(bin, "gh"), 0o755);

  /** A linked worktree on its own branch with one commit, & the PR state the stub reports. */
  const worktree = (
    branch: string,
    state?: "CLOSED" | "MERGED" | "OPEN",
    { commitDate = "", headMatches = true, path = join(directory, branch) } = {},
  ) => {
    gitIn(primary, "worktree", "add", "-q", "-b", branch, path);
    commit(path, branch, commitDate);
    const head = headMatches ? gitIn(path, "rev-parse", "HEAD") : "0".repeat(40);
    if (state) writeFileSync(join(prs, branch), `${state} ${head}\n`);
    return path;
  };
  const detachedWorktree = (
    name: string,
    { commitChanges = false, path = join(directory, name) } = {},
  ) => {
    gitIn(primary, "worktree", "add", "-q", "--detach", path, "main");
    if (commitChanges) commit(path, name);
    return path;
  };
  const run = (args: string[] = [], idleMinutes = "0", cwd = primary) =>
    spawnSync("bash", [script, ...args], {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        MISTRIA_CLEANUP_IDLE_MINUTES: idleMinutes,
        PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
      },
    });
  const branches = () => gitIn(primary, "branch", "--format=%(refname:short)").split("\n");
  return { bin, branches, detachedWorktree, directory, origin, primary, prs, run, worktree };
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

  it("previews and removes a detached worktree reachable from a remote branch", () => {
    const { detachedWorktree, run } = fixture();
    const path = detachedWorktree("detached");
    const preview = run();
    expect(preview.status).toBe(0);
    expect(preview.stdout).toContain(`would remove ${path} (detached, reachable from origin/main)`);
    expect(existsSync(path)).toBe(true);

    const applied = run(["--apply"]);
    expect(applied.status).toBe(0);
    expect(applied.stdout).toContain(`removed ${path} (detached, reachable from origin/main)`);
    expect(existsSync(path)).toBe(false);
  });

  it("keeps a detached worktree whose head isn't reachable from a remote branch", () => {
    const { detachedWorktree, run } = fixture();
    const path = detachedWorktree("unpublished", { commitChanges: true });
    const result = run(["--apply"]);
    expect(result.stdout).toContain(
      `keep ${path}: detached HEAD isn't reachable from a current remote branch`,
    );
    expect(existsSync(path)).toBe(true);
  });

  it("keeps a detached worktree when its remote branch was deleted but its tracking ref is stale", () => {
    const { detachedWorktree, primary, run } = fixture();
    const path = detachedWorktree("deleted-topic", { commitChanges: true });
    const head = gitIn(path, "rev-parse", "HEAD");
    gitIn(primary, "update-ref", "refs/heads/topic", head);
    gitIn(primary, "update-ref", "refs/remotes/origin/topic", head);
    gitIn(primary, "update-ref", "-d", "refs/heads/topic");
    expect(gitIn(primary, "branch", "--list", "topic")).toBe("");
    expect(gitIn(primary, "rev-parse", "refs/remotes/origin/topic")).toBe(head);

    const result = run(["--apply"]);
    expect(result.stdout).toContain(
      `keep ${path}: detached HEAD isn't reachable from a current remote branch`,
    );
    expect(existsSync(path)).toBe(true);
    expect(gitIn(primary, "branch", "-r", "--list", "origin/topic")).toBe("");
  });

  it("keeps a detached worktree when it can't refresh remote heads", () => {
    const { detachedWorktree, directory, primary, run } = fixture();
    const path = detachedWorktree("offline");
    gitIn(primary, "remote", "set-url", "origin", join(directory, "missing-origin"));

    const result = run(["--apply"]);
    expect(result.stdout).toContain(`keep ${path}: couldn't verify current remote branches`);
    expect(existsSync(path)).toBe(true);
  });

  it("removes every finished worktree & its branch, and keeps the primary checkout", () => {
    const { branches, primary, prs, run, worktree } = fixture();
    // A merged PR for main too, so only the primary-checkout guard keeps it.
    writeFileSync(join(prs, "main"), `MERGED ${gitIn(primary, "rev-parse", "HEAD")}\n`);
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

  it("logs locked worktrees", () => {
    const { primary, run, worktree } = fixture();
    const locked = worktree("locked", "MERGED");
    gitIn(primary, "worktree", "lock", locked);
    const result = run();
    expect(result.stdout).toContain(`keep ${locked}: locked`);
  });

  it("handles a worktree path with a space", () => {
    const { directory, run, worktree } = fixture();
    const path = worktree("spaced", "MERGED", { path: join(directory, "with space") });
    expect(run().stdout).toContain(`would remove ${path} (spaced, PR MERGED)`);
  });

  it("keeps a worktree when gh fails", () => {
    const { run, worktree } = fixture();
    const path = worktree("broken", "MERGED");
    const result = run(["--apply"]);
    expect(result.stdout).toContain(`keep ${path}: PR not found`);
    expect(existsSync(path)).toBe(true);
  });

  it("keeps the worktree it runs from", () => {
    const { run, worktree } = fixture();
    const path = worktree("here", "MERGED");
    const result = run(["--apply"], "0", path);
    expect(result.stdout).toContain(`keep ${path}: current worktree`);
    expect(existsSync(path)).toBe(true);
  });

  it("keeps ignored local files, but not links, build output, or unchanged copies", () => {
    const { primary, run, worktree } = fixture();
    writeFileSync(join(primary, ".gitignore"), "/.worktrees/\n.env\nbuild/\nnode_modules/\nlink\n");
    gitIn(primary, "add", ".gitignore");
    commit(primary, "ignore");
    writeFileSync(join(primary, ".env"), "SHARED=1\n");
    const local = worktree("local", "MERGED");
    writeFileSync(join(local, ".env"), "LOCAL=1\n");
    const disposable = worktree("disposable", "MERGED");
    writeFileSync(join(disposable, ".env"), "SHARED=1\n");
    mkdirSync(join(disposable, "build"));
    writeFileSync(join(disposable, "build", "out.js"), "");
    mkdirSync(join(disposable, "node_modules"));
    writeFileSync(join(disposable, "node_modules", "dep.js"), "");
    symlinkSync(join(primary, "file"), join(disposable, "link"));
    const result = run();
    expect(result.stdout).toContain(`keep ${local}: ignored local file .env`);
    expect(result.stdout).toContain(`would remove ${disposable} (disposable, PR MERGED)`);
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

  it("counts a recent index change as activity, even with an old commit", () => {
    const { run, worktree } = fixture();
    const path = worktree("touched", "MERGED", { commitDate: "2000-01-01T00:00:00Z" });
    utimesSync(
      join(gitIn(path, "rev-parse", "--absolute-git-dir"), "index"),
      new Date(),
      new Date(),
    );
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

  it("previews and removes only standalone branches at a finished PR's head", () => {
    const { branches, primary, run, worktree } = fixture();
    for (const [branch, state, headMatches] of [
      ["merged", "MERGED", true],
      ["closed", "CLOSED", true],
      ["open", "OPEN", true],
      ["no-pr", undefined, true],
      ["unpushed", "MERGED", false],
      ["broken", "MERGED", true],
      ["next", "MERGED", true],
    ] as const) {
      const path = worktree(branch, state, { headMatches });
      gitIn(primary, "worktree", "remove", path);
    }
    const checkedOut = worktree("checked-out", "MERGED");
    gitIn(primary, "worktree", "lock", checkedOut);

    expect(run([], "120").stdout).not.toContain("would delete branch");
    const preview = run();
    expect(preview.status).toBe(0);
    expect(preview.stdout).toContain("would delete branch merged (PR MERGED)");
    expect(preview.stdout).toContain("would delete branch closed (PR CLOSED)");
    expect(branches()).toContain("merged");

    const result = run(["--apply"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("deleted branch merged (PR MERGED)");
    expect(result.stdout).toContain("deleted branch closed (PR CLOSED)");
    expect(branches().toSorted()).toEqual([
      "broken",
      "checked-out",
      "main",
      "next",
      "no-pr",
      "open",
      "unpushed",
    ]);
    expect(existsSync(checkedOut)).toBe(true);
  });

  it("keeps a recently created branch at an old commit", () => {
    const { directory, primary, prs, run } = fixture();
    const path = join(directory, "old");
    gitIn(primary, "worktree", "add", "--detach", path);
    commit(path, "old", "2000-01-01T00:00:00Z");
    const head = gitIn(path, "rev-parse", "HEAD");
    gitIn(primary, "branch", "recent", head);
    gitIn(primary, "worktree", "remove", path);
    writeFileSync(join(prs, "recent"), `MERGED ${head}\n`);

    expect(run([], "120").stdout).not.toContain("would delete branch recent");
    expect(run().stdout).toContain("would delete branch recent (PR MERGED)");
  });

  it("keeps a branch that moves just before deletion", () => {
    const { bin, primary, run, worktree } = fixture();
    const topic = worktree("topic", "MERGED");
    gitIn(primary, "worktree", "remove", topic);
    const unpublished = worktree("unpublished");
    const newTip = gitIn(unpublished, "rev-parse", "HEAD");
    const git = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
    const wrapper = join(bin, "git");
    writeFileSync(
      wrapper,
      `#!/usr/bin/env bash
if [ "$1" = update-ref ] && [ "$3" = -d ] && [ "$4" = refs/heads/topic ]; then
  "${git}" update-ref refs/heads/topic "${newTip}" || exit 1
fi
exec "${git}" "$@"
`,
      { mode: 0o755 },
    );

    const result = run(["--apply"]);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("failed to delete branch topic");
    expect(gitIn(primary, "rev-parse", "refs/heads/topic")).toBe(newTip);
  });

  it("clears redundant local branches using freshly fetched origin heads", () => {
    const { branches, origin, primary, prs, run, worktree } = fixture();
    const published = worktree("published");
    const head = gitIn(published, "rev-parse", "HEAD");
    gitIn(primary, "worktree", "remove", published);
    gitIn(primary, "push", "-q", "origin", "published");
    gitIn(origin, "update-ref", "refs/heads/next", gitIn(primary, "rev-parse", "main"));
    gitIn(primary, "branch", "review-alias", head);
    gitIn(primary, "branch", "old-main", "main");
    const open = worktree("open", "OPEN");
    gitIn(primary, "push", "-q", "origin", "open:refs/heads/other");
    writeFileSync(join(prs, "finished"), `100 ${gitIn(open, "rev-parse", "HEAD")} MERGED open\n`);
    gitIn(primary, "worktree", "remove", open);
    const stale = worktree("stale");
    gitIn(primary, "push", "-q", "origin", "stale:refs/heads/deleted");
    gitIn(origin, "update-ref", "-d", "refs/heads/deleted");
    gitIn(primary, "worktree", "remove", stale);

    const preview = run();
    expect(preview.stdout).toContain(
      "would delete branch review-alias (reachable from origin/published)",
    );
    expect(preview.stdout).toContain("would delete branch old-main (reachable from origin/main)");
    expect(branches()).toContain("review-alias");
    expect(run(["--apply"]).status).toBe(0);
    expect(branches().toSorted()).toEqual(["main", "open", "published", "stale"]);
  });

  it("clears aliases and older tips of merged PRs, and requires an exact match for closed PRs", () => {
    const { branches, directory, origin, primary, prs, run, worktree } = fixture();
    const merged = worktree("merged");
    gitIn(primary, "branch", "old-merged", "merged");
    gitIn(primary, "push", "-q", "origin", "merged");
    gitIn(primary, "worktree", "remove", merged);
    gitIn(primary, "branch", "-D", "merged");
    const publisher = join(directory, "publisher");
    gitIn(directory, "clone", "-q", "--branch", "merged", origin, publisher);
    commit(publisher, "later merged commit");
    const mergedHead = gitIn(publisher, "rev-parse", "HEAD");
    gitIn(publisher, "push", "-q", "origin", "HEAD:refs/pull/10/head", ":refs/heads/merged");
    expect(spawnSync("git", ["-C", primary, "cat-file", "-e", mergedHead]).status).toBe(1);
    const closed = worktree("closed");
    gitIn(primary, "branch", "old-closed", "closed");
    commit(closed, "later closed commit");
    const closedHead = gitIn(closed, "rev-parse", "HEAD");
    gitIn(primary, "worktree", "remove", closed);
    gitIn(primary, "branch", "-m", "closed", "closed-alias");
    const diverged = worktree("diverged");
    gitIn(primary, "worktree", "remove", diverged);
    writeFileSync(
      join(prs, "finished"),
      `10 ${mergedHead} MERGED merged\n11 ${closedHead} CLOSED closed\n12 ${"0".repeat(40)} MERGED vanished\n`,
    );
    expect(gitIn(origin, "rev-parse", "refs/pull/10/head")).toBe(mergedHead);

    const result = run(["--apply"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("deleted branch old-merged (contained in a merged PR)");
    expect(result.stdout).toContain("deleted branch closed-alias (matches a finished PR)");
    expect(branches().toSorted()).toEqual(["diverged", "main", "old-closed"]);
  });

  it("keeps branches and worktrees explicitly marked to keep", () => {
    const { branches, primary, run, worktree } = fixture();
    const path = worktree("pinned-worktree", "MERGED");
    gitIn(primary, "config", "branch.pinned-worktree.mistria-keep", "true");
    gitIn(primary, "branch", "pinned-branch", "main");
    gitIn(primary, "config", "branch.pinned-branch.mistria-keep", "true");

    const result = run(["--apply"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("keep branch pinned-branch: marked to keep");
    expect(branches()).toContain("pinned-branch");
    expect(existsSync(path)).toBe(true);
  });
});
