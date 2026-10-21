# Machine setup

tl;dr: install the tools below, run `node scripts/machine-doctor.ts` until it is clean, then run the
interactive logins yourself. A fresh macOS or Windows machine that follows this document reaches a
passing `pnpm run verify`. Linux works with the same steps; use your package manager.

The doctor is the diagnostic for this document. It reports each prerequisite as present, missing, or
the wrong version, prints the exact fix, & changes nothing. It never installs, configures, or
authenticates, and it never reads credentials; the logins below are yours to run. Re-run it any time
a machine misbehaves. Always run it with `node`, never through pnpm: `pnpm run` installs or verifies
dependencies first and runs scripts on the `devEngines` runtime from `package.json`, which hides the
Node version agent shells actually use.

Agents may initialize an isolated harness-created worktree with `node scripts/setup-worktree.ts`
when dependencies or included links are absent; this standard setup is preauthorized, including
after a missing-dependency preflight failure. Other local tooling failures, including failure of
setup itself, require agents to stop & report them; see “Tooling failures” in
[AGENTS.md](../AGENTS.md). A human or the user directs the repair, then the agent resumes.

## Required for every contributor

1. **Git** (`brew install git`, `winget install Git.Git`). On Windows, also run
   `git config --global core.longpaths true`, or worktrees with deep `node_modules` paths fail.
2. **Node** within `engines.node` in `package.json` (currently `>=24.15.0 <27.0.0`). Install a
   versioned package, because the unversioned ones track Node's newest major, which can fall outside
   `engines`: `brew install node@24 && brew link --force node@24` on macOS (the versioned formula is
   keg-only; run `brew unlink node` first if Homebrew's newer `node` is linked), or
   `winget install OpenJS.NodeJS.LTS` on Windows. You don't need `.node-version`'s exact release or
   a version manager: `devEngines.runtime` makes `pnpm install` download that release, and every
   `pnpm run` & `pnpm exec` uses it. Your system `node` only runs the doctor & Claude's hooks, and
   repository scripts started with bare `node` refuse to run on another release (use `pnpm run` or
   `pnpm exec node` instead).
3. **pnpm**, at the major version in `packageManager` in `package.json` (currently 11). Its launcher
   then downloads the exact pinned release. Install the major explicitly, because the default
   packages track pnpm's newest major: `brew install pnpm@11 && brew link --force pnpm@11` on macOS
   (the versioned formula is keg-only, and plain `brew install pnpm` installs pnpm 12), or elsewhere
   pnpm's standalone installer with `PNPM_VERSION` set to the pinned release. An installed pnpm of
   another major can switch with `pnpm self-update 11`. Corepack is not an option, because Node 25
   and later no longer bundle it. On Windows PowerShell, use `pnpm.cmd` if the execution policy
   blocks `pnpm.ps1`. See the pnpm launcher note in
   [development-workflow.md](development-workflow.md#1-local-setup-requirements).
4. **ShellCheck**, because `pnpm run lint` runs it (`brew install shellcheck`,
   `winget install koalaman.shellcheck`).
5. **GitHub CLI** (`brew install gh`, `winget install GitHub.cli`), then run `gh auth login` and
   choose HTTPS. The remote stays HTTPS; do not switch it to SSH.
6. **Dependencies**: `pnpm install --frozen-lockfile`, or `node scripts/setup-worktree.ts` inside a
   worktree. Every other `pnpm run` or `pnpm exec` command fails with
   `ERR_PNPM_VERIFY_DEPS_BEFORE_RUN` until dependencies match the lockfile, rather than installing
   them implicitly.
7. **Commit signing** (maintainer machine): a local SSH key with `gpg.format = ssh` &
   `gpg.ssh.program = ssh-keygen`, per [git identity](agent-workflow.md#git-identity). The doctor
   lists this as a todo, never a failure, because cloud sandboxes legitimately skip it. If
   `tag.gpgsign` is on, every `git tag` becomes a signed annotated tag that needs a message, so
   scripts & tests that create tags pass `-c tag.gpgsign=false`; the doctor flags `tag.gpgsign`
   without a signing key as wrong.

## Needed for specific work

1. **Playwright browsers** for the accessibility & PWA suites, which only CI installs by default:
   `pnpm exec playwright install firefox chromium`.
2. **Game assets** for pipeline work: place or link them at `pipeline/input/` (see
   [game-version-update-protocol.md](game-version-update-protocol.md)). `pnpm run game-assets:share`
   copies them to the maintainer's shared drive.
3. **Wrangler login** for R2 uploads: `pnpm exec wrangler login`, then `pnpm exec wrangler whoami`.
   The doctor does not probe this because the login is interactive & stored credentials stay out of
   its reach. Never run `pnpx wrangler`.

## Codex shells

Codex shells use the machine’s shared global pnpm store, with pnpm’s home writable in the sandbox.
Run `pnpm store path` outside the sandbox to find the store; if it ends in a version directory such
as `v11`, use its parent for `pnpm_config_store_dir`. Use `PNPM_HOME` for the writable root
(`~/Library/pnpm` on macOS), covering both `store/` & `package-manager-store/`. Add these settings
to the user-level `~/.codex/config.toml`, replacing `<user>` with your username:

```toml
[shell_environment_policy.set]
pnpm_config_store_dir = "/Users/<user>/Library/pnpm/store"

[sandbox_workspace_write]
writable_roots = ["/Users/<user>/Library/pnpm"]
```

These paths belong in the user config because they differ per machine; Codex merges them with the
project’s `[sandbox_workspace_write] network_access = true`. pnpm’s version manager opens the
store’s `v11/index.db` on every command, including `pnpm --version`, so read access alone fails with
“unable to open database file”. Keep one shared store across agents, shells, & worktrees; request
sandbox access when needed instead of selecting a separate store.

pnpm 11 ignores the legacy `npm_config_store_dir` spelling. In a Codex shell, the doctor fails when
the variable is unset, legacy-only, relative, inside the repository, different from the store pnpm
reports, or the store directory or existing `v11/index.db` is unwritable from that shell. Hook
installation during `prepare` writes shared Git metadata, which the sandbox may need the user to
approve.

## Verify the result

1. `node scripts/machine-doctor.ts` exits 0, or reports only the "Needed for specific work" items
   you don't need, such as game assets outside pipeline work.
2. `pnpm run verify` passes.

If a step fails, the doctor's output names the prerequisite; fix it there, not by working around the
failing command.
