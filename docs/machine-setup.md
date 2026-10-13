# Machine setup

tl;dr: install the tools below, run `node scripts/machine-doctor.ts` until it is clean, then run the
interactive logins yourself. A fresh macOS or Windows machine that follows this document reaches a
passing `pnpm run verify`. Linux works with the same steps; use your package manager.

The doctor is the diagnostic for this document. It reports each prerequisite as present, missing, or
the wrong version, prints the exact fix, & changes nothing. It never installs, configures, or
authenticates, and it never reads credentials; the logins below are yours to run. Re-run it any time
a machine misbehaves (`pnpm run machine:doctor` once pnpm works; before that,
`node scripts/machine-doctor.ts`, which needs only Node).

Agents that hit a local tooling failure stop & report it instead of repairing it; see "Local tooling
failures" in [AGENTS.md](../AGENTS.md). A human or the user fixes the machine with this procedure,
then the agent resumes.

## Required for every contributor

1. **Git** (`brew install git`, `winget install Git.Git`). On Windows, also run
   `git config --global core.longpaths true`, or worktrees with deep `node_modules` paths fail.
2. **Node** at the version in `.node-version`, activated so agent shells see it, not only your
   interactive shell (fnm, nvm, or Volta; confirm with `node --version` in a fresh shell). A newer
   major, such as Node 26, fails the doctor.
3. **pnpm**, at a major version matching `packageManager` in `package.json`. Its launcher then
   downloads the pinned release. On Windows PowerShell, use `pnpm.cmd` if the execution policy
   blocks `pnpm.ps1`. See the pnpm launcher note in
   [development-workflow.md](development-workflow.md#1-local-setup-requirements).
4. **ShellCheck**, because `pnpm run lint` runs it (`brew install shellcheck`,
   `winget install koalaman.shellcheck`).
5. **GitHub CLI** (`brew install gh`, `winget install GitHub.cli`), then run `gh auth login` and
   choose HTTPS. The remote stays HTTPS; do not switch it to SSH.
6. **Dependencies**: `pnpm install --frozen-lockfile`, or `pnpm run worktree:setup` inside a
   worktree.
7. **Commit signing** (maintainer machine): a local SSH key with `gpg.format = ssh` &
   `gpg.ssh.program = ssh-keygen`, per [git identity](agent-workflow.md#git-identity). The doctor
   lists this as a todo, never a failure, because cloud sandboxes legitimately skip it.

## Needed for specific work

1. **Playwright browsers** for the accessibility & PWA suites, which only CI installs by default:
   `pnpm exec playwright install firefox chromium`.
2. **Game assets** for pipeline work: place or link them at `pipeline/input/` (see
   [game-version-update-protocol.md](game-version-update-protocol.md)). `pnpm run game-assets:share`
   copies them to the maintainer's shared drive.
3. **Wrangler login** for R2 uploads: `pnpm exec wrangler login`, then `pnpm exec wrangler whoami`.
   The doctor does not probe this because the login is interactive & stored credentials stay out of
   its reach. Never run `pnpx wrangler`.
4. **Python 3** for the public-repo candidate procedure ([public-repo.md](public-repo.md)). On
   Windows the Microsoft Store `python3` alias does not count; use
   `winget install Python.Python.3.13`.

## Codex shells

Codex sandboxes keep package-manager caches outside the repository. Set
`npm_config_store_dir=/private/tmp/codex-pnpm-store` for every pnpm command in the session, because
pnpm's version manager can otherwise use a repo-local `.pnpm-store` for its own executable. The
doctor flags a Codex shell where it is unset. Hook installation during `prepare` writes shared Git
metadata, which the sandbox may need the user to approve.

## Verify the result

1. `node scripts/machine-doctor.ts` exits 0.
2. `pnpm run verify` passes.

If a step fails, the doctor's output names the prerequisite; fix it there, not by working around the
failing command.
