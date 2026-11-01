# Machine setup

tl;dr: install the tools below, run `node scripts/machine-doctor.ts` until it is clean, then run the
interactive logins yourself. A fresh macOS or Windows machine that follows this document reaches a
passing `pnpm run verify`. Linux works with the same steps; use your package manager.

The doctor is the diagnostic for this document. It reports each prerequisite as present, missing, or
the wrong version, prints the exact fix, & changes nothing. It never installs, configures, or
authenticates, and it never prints or validates credentials; the logins & tokens below are yours to
set up. Re-run it any time a machine misbehaves. Always run it with `node`, never through pnpm:
`pnpm run` installs or verifies dependencies first and runs scripts on the `devEngines` runtime from
`package.json`, which hides the Node version agent shells actually use.

The doctor groups its checks into sections by work area. `core` covers "Required for every
contributor" & always runs; the others match "Needed for specific work": `browser` (Playwright
browsers), `pipeline` (game assets), & `release` (the R2 upload token). With no flag it checks every
section; `--for` checks core plus the named ones, lists the rest as skipped, & leaves skipped
sections out of the exit status. An unknown section name exits 2 with the valid names.

```bash
node scripts/machine-doctor.ts                         # every section
node scripts/machine-doctor.ts --for core              # UI work, no game files
node scripts/machine-doctor.ts --for browser,pipeline  # core, browser tests, & pipeline
```

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
   them implicitly. The install also links the pinned Node at `node_modules/.bin/node`, which the
   committed VS Code settings point the Vitest extension at; Windows needs a local override (see
   [test file placement](development-workflow.md#test-file-placement)).
7. **Commit signing** (maintainer machine): a local SSH key with `gpg.format = ssh` &
   `gpg.ssh.program = ssh-keygen`, per [git identity](agent-workflow.md#git-identity). The doctor
   lists this as a todo, never a failure, because cloud sandboxes legitimately skip it. If
   `tag.gpgsign` is on, every `git tag` becomes a signed annotated tag that needs a message, so
   scripts & tests that create tags pass `-c tag.gpgsign=false`; the doctor flags `tag.gpgsign`
   without a signing key as wrong.

## Needed for specific work

Each item names the doctor section that checks it.

1. **Playwright browsers** (`browser`) for the accessibility & PWA suites, which only CI installs by
   default: `pnpm exec playwright install chromium`, which includes the headless shell that headless
   runs launch. The suites use Chromium only. The doctor checks the exact revisions the installed
   Playwright expects.
2. **Game assets** (`pipeline`) for pipeline work: place or link them at `pipeline/input/` (see
   [game-version-update-protocol.md](game-version-update-protocol.md)). `pnpm run game-assets:share`
   copies them to the maintainer's shared drive.
3. **R2 upload token** (`release`) for `sprites:upload` & `fonts:upload`, which run Wrangler against
   the `mistria-fyi-assets` bucket. The upload scripts hand `R2_UPLOAD_TOKEN` to Wrangler as its
   `CLOUDFLARE_API_TOKEN`, for that child process only, so no `wrangler login` is needed. The
   separate name keeps the R2 token from replacing the read-only Pages token that `cloudflare:logs`
   & cloud agents read from `CLOUDFLARE_API_TOKEN`
   ([cloud-agent-environments.md](cloud-agent-environments.md)). The maintainer creates the token
   once per machine:
   1. In the Cloudflare dashboard, open **R2 → Manage API tokens → Create API token**.
   2. Choose **Admin Read & Write**. Cloudflare documents the bucket-scoped **Object Read & Write**
      permission as S3-API only, and Wrangler uses the Cloudflare API, so an object token is not
      expected to work (#115 tracks a test). That permission covers every bucket in the account,
      deletion included, so narrow the token where the form allows: set a **TTL** (for example 90
      days) and, if your upload machine has a stable IP, restrict **Client IP Address Filtering** to
      it.
   3. Copy the **Token value**; the S3 access key pair it also shows isn't used. Copy the account ID
      from the R2 overview.
   4. Save both in `.env.r2-upload` at the root of the main checkout:

      ```sh
      R2_UPLOAD_TOKEN=…
      CLOUDFLARE_ACCOUNT_ID=…
      ```

      Save it as UTF-8; a byte-order mark is fine. `.gitignore` keeps it out of commits, and
      `.worktreeinclude` excludes it, so worktrees never hold a copy that goes stale after a
      rotation: the upload scripts & `r2:check` read it from the main checkout, from any worktree. A
      nonempty shell variable of the same name wins. Agents can then run the uploads in the
      [game version update](game-version-update-protocol.md) without a dedicated shell; each upload
      still asks for permission. Claude Code's `Read(**/.env.r2-upload)` deny rule and the shared
      read guard keep agents from opening or recursively searching the file, but anything running as
      your user can read it. If you suspect the token was exposed, revoke it in the dashboard &
      create a new one; that is the expected response, not an emergency. A worktree made before this
      exclusion may hold a copy or hard link; delete that worktree's `.env.r2-upload`.

   5. Run `pnpm run r2:check`. It puts & deletes a probe object in the bucket, which proves the
      token can write; a real upload doesn't, because it skips every object that is already current
      and so may never call Wrangler. Without `R2_UPLOAD_TOKEN`, a real upload refuses to start
      rather than falling back to a stored `wrangler login`; a `DRY_RUN=1` preview still works.

   Note: Wrangler loads `.env` & `.env.local` from the repository root itself, but never
   `.env.r2-upload`. Keep `CLOUDFLARE_API_TOKEN`, `R2_UPLOAD_TOKEN`, & `CLOUDFLARE_ACCOUNT_ID` out
   of `.env` & `.env.local`: a `CLOUDFLARE_API_TOKEN` there reaches any Wrangler call that doesn't
   set its own, and an account ID there satisfies Wrangler while the doctor still reports it unset.

   The doctor checks only that both names are set, in the shell or the main checkout's
   `.env.r2-upload`; it never prints or validates the token. A token has no interactive step, so it
   can be revoked & replaced in the dashboard at any time. Never run `pnpx wrangler`.

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

Git metadata has a separate sandbox boundary from checkout files, including in desktop-created
worktrees. See [Codex Git sandbox](codex-git-sandbox.md) before changing writable roots or
diagnosing an “index.lock” denial. Command allowlists do not grant filesystem access, & restarting
Codex with unchanged settings does not remove that protection.

## Verify the result

1. `node scripts/machine-doctor.ts --for <the sections you need>` exits 0; for example, `--for core`
   on a machine that never runs the pipeline.
2. `pnpm run verify` passes.

If a step fails, the doctor's output names the prerequisite; fix it there, not by working around the
failing command.
