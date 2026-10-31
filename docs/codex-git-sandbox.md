# Codex Git sandbox

Codex’s “workspace-write” sandbox protects Git metadata separately from checkout files. A writable
linked worktree can therefore fail to create “index.lock” in its external Git directory. This is a
Codex permission-engine restriction; repository hooks & command approval rules do not grant
filesystem access.

## Resolve the paths

Run these read-only commands inside the affected worktree:

```sh
cat .git
git rev-parse --path-format=absolute --show-toplevel --git-dir --git-common-dir
```

For a desktop worktree, the paths can have this shape:

| Purpose                | Example                               |
| ---------------------- | ------------------------------------- |
| Writable checkout      | `~/.codex/worktrees/<id>/mistria-fyi` |
| Worktree Git directory | `<main>/.git/worktrees/mistria-fyi2`  |
| Common Git directory   | `<main>/.git`                         |

Resolve symlinks before comparing these paths with the session’s effective filesystem permissions.
Inspect the permissions supplied to the running session, not merely “config.toml”: a running session
can retain an earlier policy, and the desktop or managed harness can supply overrides.

Codex follows the checkout’s “.git” pointer & adds its target as read-only. On macOS, Seatbelt
enforces the resulting policy. Normal Unix ownership & write bits do not override that sandbox. The
common directory holds shared objects & refs; making only the index writable does not cover every
Git operation.

## Find the owner

The relevant layers have different responsibilities:

1. The user’s “~/.codex/config.toml” supplies machine-specific settings, including pnpm’s writable
   home. A project’s “.codex/config.toml” supplies this repository’s “workspace-write”,
   “on-request”, & network settings.
2. The desktop creates the linked worktree & supplies its workspace roots. Codex’s permission engine
   derives the protected metadata paths from those roots. Its
   [Git-pointer handling](https://github.com/openai/codex/blob/main/codex-rs/protocol/src/permissions.rs)
   explains why the external worktree metadata directory appears as read-only.
3. The project’s “.codex/rules/default.rules” governs command approval. An “allow” rule does not
   make a protected path writable.
4. The “SessionStart” hook runs “scripts/setup-worktree.ts”. It links inputs & installs
   dependencies; it cannot change the already selected sandbox policy. Setup itself can need Git
   metadata writes for its lock & hook installation.

An approved “require_escalated” retry uses different filesystem permissions. Its success explains
the original denial; it does not prove the ordinary sandbox is fixed.

## Reproduce safely

The following result was verified on October 31, 2026:

| Component     | Version                    |
| ------------- | -------------------------- |
| Codex desktop | 26.1027.30824, build 22943 |
| Bundled CLI   | 0.166.0-alpha.5.1          |
| macOS         | 27.2, build 26B123         |

Run the launcher from an authorized host shell, so an enclosing sandbox does not obscure the policy
being tested. The Git command then runs inside a fresh Codex sandbox without escalation.

First, create a detached, disposable worktree from the repository’s current commit. Replace the main
checkout path; do not use an existing worktree for this test.

```sh
codex_bin=/Applications/Codex.app/Contents/Resources/codex-cli/bin/codex
repo=/absolute/path/to/main/checkout
probe_root=$(mktemp -d /private/tmp/mistria-git-sandbox.XXXXXX)
probe="$probe_root/worktree"
git -C "$repo" worktree add --detach "$probe" HEAD
git -C "$probe" rev-parse --path-format=absolute --git-dir --git-common-dir
"$codex_bin" sandbox -P :workspace -C "$probe" -- git switch --detach HEAD
```

This version requires “-P” (“--permission-profile”). It uses “codex sandbox” directly, without a
“macos” subcommand. Read the installed version’s “codex sandbox --help” before adapting the test to
another release.

The default-policy test exits 128 when Git cannot create “index.lock”. A temporary named profile can
demonstrate the exact-path override. Substitute both absolute paths printed above:

```sh
"$codex_bin" sandbox -P git-probe -C "$probe" \
  -c 'permissions.git-probe={extends=":workspace",filesystem={"/absolute/main/.git"="write","/absolute/main/.git/worktrees/worktree"="write"}}' \
  -- git switch --detach HEAD
```

This override is confined to the diagnostic process; it does not edit persistent configuration. Both
commands select the same detached commit, so they preserve the disposable checkout’s content.
Inspect stderr as well as the exit status: an incomplete grant can let Git return zero while
reporting a failed write elsewhere in the common directory.

The verified results were:

| Fresh sandbox policy                                                       | Result                                      |
| -------------------------------------------------------------------------- | ------------------------------------------- |
| Built-in “:workspace”                                                      | Exit 128; “index.lock” denied               |
| Named profile granting only the common Git directory                       | Exit 128; “index.lock” denied               |
| Named profile granting the common directory & its “worktrees/**” subtree   | Exit 128; “index.lock” denied               |
| Named profile granting only the exact worktree Git directory               | Exit zero; “packed-refs.lock” errors remain |
| Named profile granting the common directory & exact worktree Git directory | Exit zero; no permission errors             |

A separate check staged a sentinel file & created an untracked file in the disposable worktree. The
successful switch preserved both files & the staged diff. Every branch ref stayed unchanged; the
main checkout’s index & the active chat checkout’s index retained their SHA-256 hashes.

Remove only the disposable worktree after checking that it has no changes:

```sh
git -C "$probe" status --short
git -C "$repo" worktree remove "$probe"
rmdir "$probe_root"
```

Do not force removal, prune other worktrees, switch existing branches, or move another checkout’s
index. A failed cleanup needs the same stop & report treatment as other tooling failures.

## Keep the boundary

An exact-path profile works for one known worktree. It is not a durable fix for new desktop
worktrees, whose metadata directory names change. Granting the common directory or its worktree
subtree does not remove the more specific automatic protection in the tested version. Do not add a
static list of today’s worktrees to shared configuration or make unrelated repositories writable.

Keep “workspace-write”, “on-request”, & the configured approval reviewer. Until Codex supports the
needed worktree-aware grant, use narrowly approved escalation for required Git writes. Restarting
with unchanged settings does not remove the restriction.

The matching upstream bug is [openai/codex#27418](https://github.com/openai/codex/issues/27418). The
related capability request is [openai/codex#14338](https://github.com/openai/codex/issues/14338).
Add new platform or version evidence to those reports instead of filing another upstream duplicate.
A useful fix would derive the active worktree’s exact Git directory & required common metadata
access while preserving the other protected paths & approval settings.

## Verify a fresh session

Fresh desktop-session verification remains pending an upstream fix or a supported automatic
permission setting. A successful temporary-profile test does not satisfy this check.

After applying that fix:

1. Finish active Git operations, then quit Codex with Command-Q & reopen the app. Restart the
   app-server too if it is managed separately; reopening a window alone can retain the old server.
2. Start a new chat in a newly created, disposable worktree of this repository. Do not resume the
   old chat or reuse its metadata directory.
3. Resolve the paths above & inspect the new session’s effective filesystem permissions. Confirm
   that the active worktree metadata is writable, the sandbox remains restricted to the intended
   workspace, & the approval settings remain unchanged.
4. Have the agent run “git switch --detach HEAD” directly through its ordinary shell tool, without
   “require_escalated”, a command-line profile override, or a host-terminal Git command. Require
   exit zero & no permission errors. Check that checkout content & staged changes are unchanged.
5. Remove that disposable worktree through the usual authorized cleanup. Record the desktop & CLI
   versions, resolved paths, effective grants, command output, & any remaining denials.
