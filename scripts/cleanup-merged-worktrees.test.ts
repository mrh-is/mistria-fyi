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
import { afterAll, describe, expect, it } from "vitest";

const script = readFileSync(new URL("cleanup-merged-worktrees.sh", import.meta.url), "utf8");
const directories: string[] = [];

afterAll(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function gitFixture(
  options: {
    ancestor?: boolean;
    associated?: boolean;
    detached?: boolean;
    dirty?: boolean;
    exact?: boolean;
    failure?: boolean;
    fetchFailure?: boolean;
    localCommit?: boolean;
    locked?: boolean;
    open?: boolean;
    openAssociation?: boolean;
    openBranch?: boolean;
    openFailure?: boolean;
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
    execFileSync("git", ["-C", checkout, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  git("init", "--initial-branch=main");
  git("config", "user.name", "Cleanup test");
  git("config", "user.email", "cleanup@example.invalid");
  git("config", "commit.gpgsign", "false");
  writeFileSync(join(checkout, "file"), "initial\n");
  git("add", ".");
  git("commit", "-m", "Initial");
  git("remote", "add", "origin", options.fetchFailure ? join(directory, "missing") : checkout);
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  git("symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
  git("switch", "-c", "worktree-agent-test");
  writeFileSync(join(checkout, "file"), "candidate commit\n");
  git("commit", "-am", "Candidate");
  const mergedTip = git("rev-parse", "HEAD");
  git("switch", "main");
  if (options.ancestor) {
    git("merge", "--ff-only", "worktree-agent-test");
    git("update-ref", "refs/remotes/origin/main", "HEAD");
  }
  git("worktree", "add", worktree, "worktree-agent-test");
  if (options.detached) {
    execFileSync("git", ["-C", worktree, "switch", "--detach"], { stdio: "pipe" });
    git("branch", "-D", "worktree-agent-test");
  }
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
  let openBranchResponse = ":";
  if (options.openFailure) {
    openBranchResponse = "exit 1";
  } else if (options.openBranch) {
    openBranchResponse = "echo 43";
  }
  writeFileSync(
    join(bin, "gh"),
    `#!/usr/bin/env bash
case "$*" in
  'pr list --head worktree-agent-test --state merged'*) ${options.exact ? "echo 42" : ":"} ;;
  'pr list --head worktree-agent-test --state open'*) ${openBranchResponse} ;;
  'api repos/{owner}/{repo}/commits/'*) ${options.failure ? "exit 1" : String.raw`printf '42\tmerged\tparent-branch\n'`}${options.openAssociation ? String.raw`; printf '43\topen\tother-branch\n'` : ""} ;;
  'api repos/{owner}/{repo}/pulls/42/commits'*) ${options.associated === false ? ":" : `echo ${mergedTip}`} ;;
  'pr list --head parent-branch --state open'*) ${options.open ? "echo 43" : ":"} ;;
  *) echo "Unexpected gh call: $*" >&2; exit 1 ;;
esac
`,
  );
  chmodSync(join(bin, "gh"), 0o755);
  // Process-use decisions are covered by snapshots; this case integrates only real Git.
  writeFileSync(join(bin, "lsof"), "#!/usr/bin/env bash\nexit 0\n");
  chmodSync(join(bin, "lsof"), 0o755);
  const runAt = (cwd: string, ...args: string[]) =>
    spawnSync("bash", ["-c", script, "cleanup", ...args], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` },
    });
  const run = (...args: string[]) => runAt(checkout, ...args);
  return { checkout, git, run, runAt, worktree };
}

// Decision cases supply Git/GitHub snapshots as shell functions. They execute the real script,
// but create no repositories, query no processes, and perform no destructive operations.
function fixture(options: Parameters<typeof gitFixture>[0] & { inUse?: boolean } = {}) {
  const checkout = process.cwd();
  const worktree = "/virtual/agent worktree";
  let output = "";
  const snapshot = `
removed=false
git() {
  case "$*" in
    'rev-parse --show-toplevel') printf '%s\\n' "$TEST_ROOT" ;;
    'branch --show-current') [[ $TEST_INVOKING == true ]] || echo main ;;
    'symbolic-ref --quiet --short refs/remotes/origin/HEAD') echo origin/main ;;
    'fetch --quiet origin refs/heads/main:refs/remotes/origin/main') [[ $TEST_FETCH_FAILURE != true ]] || return 1 ;;
    'for-each-ref --format=%(refname:short) refs/heads') echo main; [[ $TEST_DETACHED == true ]] || echo worktree-agent-test ;;
    'worktree list --porcelain')
      printf 'worktree %s\\nHEAD base\\nbranch refs/heads/main\\n\\n' "$TEST_ROOT"
      if [[ $removed != true ]]; then
        printf 'worktree /virtual/agent worktree\\nHEAD tip\\n'
        if [[ $TEST_DETACHED == true ]]; then echo detached; else echo 'branch refs/heads/worktree-agent-test'; fi
        [[ $TEST_LOCKED != true ]] || echo locked
      fi
      ;;
    'rev-parse worktree-agent-test') echo tip ;;
    'merge-base --is-ancestor tip refs/remotes/origin/main') [[ $TEST_ANCESTOR == true ]] || return 1 ;;
    '-C /virtual/agent worktree status --porcelain') [[ $TEST_DIRTY != true ]] || echo ' M file' ;;
    '-C /virtual/agent worktree rev-parse --absolute-git-dir') echo /virtual/git ;;
    'worktree remove /virtual/agent worktree') removed=true; echo 'TEST removed-worktree' ;;
    'branch -D worktree-agent-test') echo 'TEST removed-branch' ;;
    *) echo "Unexpected git call: $*" >&2; return 1 ;;
  esac
  return 0
}
gh() {
  case "$*" in
    'pr list --head worktree-agent-test --state merged'*) [[ $TEST_EXACT != true ]] || echo 42 ;;
    'pr list --head worktree-agent-test --state open'*)
      [[ $TEST_OPEN_FAILURE != true ]] || return 1
      [[ $TEST_OPEN_BRANCH != true ]] || echo 43 ;;
    'api repos/{owner}/{repo}/commits/'*)
      [[ $TEST_FAILURE != true ]] || return 1
      printf '42\\tmerged\\tparent-branch\\n'
      [[ $TEST_OPEN_ASSOCIATION != true ]] || printf '43\\topen\\tother-branch\\n' ;;
    'api repos/{owner}/{repo}/pulls/42/commits'*)
      [[ $TEST_ASSOCIATED == false || $TEST_LOCAL_COMMIT == true ]] || echo tip ;;
    'pr list --head parent-branch --state open'*) [[ $TEST_OPEN != true ]] || echo 43 ;;
    *) echo "Unexpected gh call: $*" >&2; return 1 ;;
  esac
  return 0
}
lsof() { [[ $TEST_IN_USE != true ]] || echo 'n/virtual/agent worktree'; return 0; }
find() { echo /virtual/git/HEAD; }
cd() { if [[ $1 == '/virtual/agent worktree' ]]; then [[ $TEST_INVOKING == true ]]; return; fi; builtin cd "$1"; }
`;
  const runAt = (cwd: string, ...args: string[]) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      TEST_INVOKING: String(cwd === worktree),
      TEST_ROOT: cwd,
    };
    for (const key of [
      "ancestor",
      "associated",
      "detached",
      "dirty",
      "exact",
      "failure",
      "fetchFailure",
      "localCommit",
      "locked",
      "open",
      "openAssociation",
      "openBranch",
      "openFailure",
      "inUse",
    ]) {
      env[`TEST_${key.replaceAll(/[A-Z]/gu, (letter) => `_${letter}`).toUpperCase()}`] = "false";
    }
    env.TEST_ASSOCIATED = "true";
    for (const [key, value] of Object.entries(options)) {
      env[`TEST_${key.replaceAll(/[A-Z]/gu, (letter) => `_${letter}`).toUpperCase()}`] =
        String(value);
    }
    const result = spawnSync("bash", ["-c", snapshot + script, "cleanup", ...args], {
      cwd: checkout,
      encoding: "utf8",
      env,
    });
    output += result.stdout;
    return result;
  };
  const git = (...args: string[]) => {
    switch (args[0]) {
      case "branch":
        return output.includes("TEST removed-branch") ? "" : "main worktree-agent-test";
      case "worktree":
        return output.includes("TEST removed-worktree") ? checkout : worktree;
      case "merge":
        options.ancestor = true;
        return "";
      default:
        throw new Error(`Unexpected fixture inspection: ${args.join(" ")}`);
    }
  };
  return { checkout, git, run: (...args: string[]) => runAt(checkout, ...args), runAt, worktree };
}

it("integrates preview & apply with one real Git fixture", () => {
  const { git, run, runAt, worktree } = gitFixture();
  expect(run().stdout).toContain(`Would remove worktree ${worktree}`);
  expect(git("branch", "--list", "worktree-agent-test")).toContain("worktree-agent-test");
  expect(runAt(worktree, "--apply").status).toBe(0);
  expect(git("worktree", "list")).toContain("agent worktree");
  const result = run("--apply");
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain("Removed branch worktree-agent-test (merged PR #42)");
  expect(git("branch", "--list", "worktree-agent-test")).toBe("");
  expect(git("worktree", "list")).not.toContain("agent worktree");
});

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
    [{ locked: true }, "locked"],
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

describe("in-use worktree protection", () => {
  it("keeps a worktree that a running process uses", () => {
    const { git, run } = fixture({ ancestor: true, associated: false, inUse: true });
    const result = run("--apply");
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("a running process is using it");
    expect(git("worktree", "list")).toContain("agent worktree");
  });

  it("keeps a worktree whose HEAD changed within the idle window", () => {
    const { git, run } = fixture({ ancestor: true, associated: false });
    const result = run("--apply", "--idle-minutes", "60");
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("HEAD changed in the last 60 minutes");
    expect(git("branch", "--list", "worktree-agent-test")).toContain("worktree-agent-test");
  });

  it("rejects a missing idle window", () => {
    expect(fixture().run("--idle-minutes").status).toBe(2);
  });
});

describe("cleanup of commits already in main", () => {
  it("previews and removes an ancestor branch without requiring a PR commit match", () => {
    const { git, run } = fixture({ ancestor: true, associated: false });
    expect(run().stdout).toContain("reachable from origin/main");
    const result = run("--apply");
    expect(result.status, result.stderr).toBe(0);
    expect(git("branch", "--list", "worktree-agent-test")).toBe("");
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
    const { git, run } = fixture({ ...options, ancestor: true, associated: false });
    expect(run("--apply").status).toBe(0);
    expect(git("branch", "--list", "worktree-agent-test")).toContain("worktree-agent-test");
  });

  it("does not trust a stale main ref after a failed fetch", () => {
    const { git, run } = fixture({ ancestor: true, associated: false, fetchFailure: true });
    const result = run("--apply");
    expect(result.stdout + result.stderr).toContain("could not refresh");
    expect(git("branch", "--list", "worktree-agent-test")).toContain("worktree-agent-test");
  });

  it("fetches new main history before checking ancestry", () => {
    const { git, run } = fixture({ associated: false });
    git("merge", "--ff-only", "worktree-agent-test");
    expect(run().stdout).toContain("reachable from origin/main");
  });
});

describe("detached worktree cleanup", () => {
  it.each([{ ancestor: true }, {}])(
    "previews and removes a confirmed detached tip: %j",
    (options) => {
      const { git, run } = fixture({ ...options, detached: true });
      expect(run().stdout).toContain("Would remove detached worktree");
      const result = run("--apply");
      expect(result.status, result.stderr).toBe(0);
      expect(git("worktree", "list")).not.toContain("agent worktree");
    },
  );

  it.each([{ dirty: true }, { locked: true }, { localCommit: true }, { associated: false }])(
    "protects a detached worktree: %j",
    (options) => {
      const { git, run } = fixture({ ...options, detached: true });
      expect(run("--apply").status).toBe(0);
      expect(git("worktree", "list")).toContain("agent worktree");
    },
  );

  it("preserves the invoking detached worktree", () => {
    const { git, runAt, worktree } = fixture({ ancestor: true, detached: true });
    expect(runAt(worktree, "--apply").status).toBe(0);
    expect(git("worktree", "list")).toContain("agent worktree");
    expect(git("branch", "--list", "main")).toContain("main");
  });

  it.each([{ openAssociation: true }, { open: true }, { failure: true }])(
    "protects an ancestor detached worktree: %j",
    (options) => {
      const { git, run } = fixture({ ...options, ancestor: true, detached: true });
      expect(run("--apply").status).toBe(0);
      expect(git("worktree", "list")).toContain("agent worktree");
    },
  );
});
