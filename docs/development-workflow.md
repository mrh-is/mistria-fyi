# Development Workflow Guide

> Detailed workflow reference for Mistria Field Guide development, including setup, worktree
> management, planning, test-driven development, and verification.

---

## 1. Local Setup Requirements

> **New machine?** Follow [machine-setup.md](machine-setup.md); it holds the per-platform install &
> login steps. Run `node scripts/machine-doctor.ts` (with `node`, not through pnpm) to see which
> prerequisites are present, missing, or the wrong version; `--for` limits it to the sections your
> work needs (see machine-setup.md). It changes nothing. If a tool is missing or broken mid-task,
> agents stop & report instead of repairing it (AGENTS.md, "Local tooling failures").

- **Node.js**: `.node-version` is the single source of truth (Node 24 LTS). `package.json`’s
  `devEngines.runtime` repeats it with `onFail: "download"`, so `pnpm install` downloads that exact
  release (checksummed in `pnpm-lock.yaml` for every platform) into the pnpm store and links it as
  `node_modules/.bin/node`. Every `pnpm run`, `pnpm exec`, and package binary then runs the pinned
  Node, whatever the shell’s own `node` is. No version manager or shell activation is needed, which
  matters for agent shells that never run mise or fnm hooks. Every repository entry point (each
  `node`/`tsx` target in `package.json`, the workflows, the Git hooks, & the shell scripts, plus
  `vite.config.ts` and the Playwright configs) imports `#scripts/lib/require-pinned-node` first, so
  a bare `node scripts/….ts` on another release exits with a message pointing at `pnpm run` or
  `pnpm exec node` instead of running silently. `scripts/lib/pinned-node.test.ts` finds those entry
  points and fails when one lacks the guard; the Claude edit-guard hook and the machine doctor
  (which must run on any Node to report a wrong one) are the exemptions. To move the pin, edit both
  files and run `pnpm install`; `tests/ci-workflow.isolated.test.ts` fails when they disagree. Check
  with `pnpm exec node -v`. `package.json`'s `engines` accepts 24.15 up to (not including) 27, so
  Codex cloud can use its preinstalled patch release & contributors can keep a newer system Node;
  the machine doctor checks the shell's own `node` against that range only.
- **ShellCheck**: `pnpm run lint` runs the system `shellcheck`. CI uses the runner image's copy, and
  `scripts/setup-cloud-agent.sh` installs it with apt. Local install: see machine-setup.md.
- **Package Manager**: Use **pnpm** exclusively. Do not use `npm`, `npx`, `yarn`, or `bun`.
- **Dependency Installation**:
  ```sh
  pnpm install --frozen-lockfile
  ```
- **pnpm launcher**: The `packageManager` field pins pnpm, and your installed pnpm downloads and
  runs that version. pnpm 12 ships as a native executable, which pnpm 11's launcher runs through
  Node and fails with `SyntaxError: Invalid or unexpected token` (issue #563 in the private beta).
  Before or when the pin moves to pnpm 12, upgrade the machine's pnpm itself to 12 (for example
  `pnpm self-update 12`, or your installer's equivalent). As a stopgap, put the downloaded native
  pnpm 12 executable first on `PATH` so nested scripts use it too. CI uses `pnpm/setup`, which
  installs the native binary directly and isn't affected.
- **Environment Configuration**: Copy `.env.example` to `.env` if local environment variables are
  required.
- **Cloud agents**: Configure Claude Code cloud and Codex cloud with the shared setup script and
  read-only Cloudflare access in [cloud-agent-environments.md](cloud-agent-environments.md).

---

## 2. Git Worktree Mechanics & Workspace Isolation

Worktrees are optional. They prevent edit collisions, dirty-state confusion, and branch-switching
interference when several sessions work at once; see [Worktrees](../AGENTS.md#worktrees).

### Worktree creation

Create and set up a worktree from any checkout with one command:

```sh
pnpm run worktree:new <issue-number>-<short-description> [starting-branch]
```

The script validates the slug (`<issue-number>-<short-description>`, lowercase), fetches the
starting branch (default `main`), creates `.worktrees/<slug>` on a matching branch from the
refreshed `origin/<starting-branch>` under the main checkout, removes the worktree & branch again if
a later step fails, refuses to run if `.worktrees/` is not gitignored, links `pipeline/input/` &
every `.worktreeinclude` entry from the main checkout, and runs `pnpm install --frozen-lockfile` and
`pnpm run prepare` (Husky hooks, Paraglide output, & `svelte-kit sync`). The link & install steps
live in `scripts/setup-worktree.ts`, which skips entries already present or missing from the main
checkout. Both scripts run under Node so Windows behaves the same; see
[Worktrees & Verification on Windows](#worktrees--verification-on-windows).

Before creating the harness worktree, fetch the intended starting branch and use its refreshed
remote tip as the base. Setup installs dependencies; it does not move an existing worktree or
refresh its base. When working directly on a starting branch, pull with `git pull --ff-only` before
edits; stop on divergence rather than resetting existing work.

Agents with their own managed worktree directory (for example `.claude/worktrees/`) may use it
instead; run the setup steps from inside it:

```sh
node scripts/setup-worktree.ts
```

It refuses to run in the main checkout. Claude Code orchestrators should give editing subagents
harness worktrees (`isolation: "worktree"`) rather than `.worktrees/<slug>`: the session's edit
guard refuses Write/Edit outside the session's own worktree, which pushed subagents into unguarded
shell writes (#545).

<details>
<summary>Manual fallback</summary>

```sh
git check-ignore -q .worktrees/placeholder
git fetch origin main
git worktree add .worktrees/<slug> -b <slug> --no-track origin/main
cd .worktrees/<slug>
ln -s /path/to/main/repo/pipeline/input pipeline/input
pnpm install --frozen-lockfile
pnpm run prepare
```

</details>

### Codex sandbox

Codex's default `workspace-write` sandbox disables command-network access & keeps `.git` read-only,
including the resolved Git directory for linked worktrees. That protects normal source edits, but
`pnpm install`, `gh`, & remote Git commands need network access, while `git worktree add`, staging,
commits, & ref updates require an approved sandbox escalation. This project's `.codex/config.toml`
enables command-network access with `[sandbox_workspace_write]` and `network_access = true`, while
keeping `sandbox_mode = "workspace-write"` and `approval_policy = "on-request"`. It leaves
`approvals_reviewer` to each contributor’s own config. Git-metadata operations can request a narrow
escalation; command allowlists in `.codex/rules/default.rules` do not grant filesystem or network
access. If the active managed environment disallows escalation, report the limitation rather than
weakening the sandbox or bypassing isolation.

For local macOS Codex worktrees, setup requires `pnpm_config_store_dir` to name the shared global
store configured in the user-level Codex config, and passes it explicitly to install & prepare. Make
pnpm’s home writable through `sandbox_workspace_write.writable_roots` as described in
[machine setup](machine-setup.md#codex-shells). Setup stops with that docs pointer when the variable
is unset; it also disables the module-purge prompt for that isolated checkout. Keep the configured
store in the parent shell for subsequent commands & approved setup retries:

```sh
: "${pnpm_config_store_dir:?Configure the shared store per docs/machine-setup.md}"
pnpm_config_confirm_modules_purge=false node scripts/setup-worktree.ts
```

Preparation still needs permission to write shared Git hook metadata. Do not use this retry to
replace another session’s dependency directory, or set `CI=true` merely to bypass a prompt.

GitHub CLI downloads run logs into its cache even though `gh run view --log` is read-only against
GitHub. Use a writable temporary cache in the sandbox instead of granting access to `~/.cache/gh`:

```sh
XDG_CACHE_HOME="$(mktemp -d /private/tmp/mistria-gh-cache.XXXXXX)" gh run view <run-id> --log-failed
```

The command-scoped override leaves the normal user cache unchanged. Remove that temporary directory
after inspecting the logs, which may contain sensitive build output.

Both browser suites use `scripts/playwright-preview.ts`. It records build/spawn/exit phases, elapsed
time, subprocess stdout & stderr, and a `/en` readiness probe every five seconds to
`.playwright-artifacts/preview-<port>.log`. A startup timeout leaves the probes & output already
written to disk, distinguishing a refused connection, HTTP response, spawn failure, or early exit.
Graceful SIGINT/SIGTERM shutdown also records the last probe; Playwright’s default force-kill cannot
produce a final shutdown entry. CI preserves these logs in each suite’s failure report. The
diagnostic probe does not decide readiness, extend Playwright’s timeout, or restart the subprocess;
retain the original failure when assessing reliability.

### Shared vs. Isolated Worktree Resources (`.worktreeinclude`)

Worktree setup links these ignored local entries from the main checkout:

- **`pipeline/input/`** (game assets): Shared read-only resource, always symlinked
  (`SHARED_DIRECTORIES` in `scripts/setup-worktree.ts`). It is deliberately absent from
  `.worktreeinclude`, which Claude Code copies into new worktrees, so the assets are never
  duplicated. To link it by hand:
  ```sh
  ln -s /path/to/main/repo/pipeline/input pipeline/input
  ```
- **`.worktreeinclude`** entries:
  - **`.env` / `.env.*`**: Machine-local environment configuration files. Symlink or copy from the
    main checkout.
- **Worktree-Isolated Entries**:
  - **`node_modules/`**, **`.svelte-kit/`**, **`build/`**: Never copy or link across worktrees. Run
    `pnpm install --frozen-lockfile` to install dependencies independently.
  - **`pipeline/output/`**: Writable generated directory. Must remain strictly isolated to each
    worktree to prevent race conditions during pipeline execution.

---

## 3. Planning & approval workflow

Mistria Field Guide uses explicit planning and approval gates for changes that need design work.

### Scope the change

- Read the issue and comments before beginning issue work.
- Existing clear acceptance criteria satisfy the scope approval gate. Proceed without requesting
  approval again or drafting a duplicate checklist; ask only about unresolved scope, conflicting
  requirements, or decisions those criteria do not settle.
- Identify affected contracts, tests, generated files, and documentation before editing.
- Use the smallest process that fits the change. Small, well-specified maintenance work does not
  require a separate specification or implementation plan.

### Issue status

Status labels show where an issue stands: `status: ready`, `status: blocked`,
`status: needs decision`, or `status: in progress`. Do not start a blocked or needs-decision issue.
A dependency on another issue is a “blocked by” relationship instead of a label, and an issue is
blocked while any issue blocking it is open; `status: blocked` covers blockers outside the tracker.
See [Issue triage](agent-workflow.md#issue-triage) for both rules & for the `delegate: small agent`
label. An issue with `status: in progress` or an `agent:*` label already has an owner; coordinate on
the issue instead of starting duplicate work. Applying these labels requires triage access, so
outside contributors say on the issue that they are taking it.

### Attribute agent-authored content

Attribution records authorship separately from active ownership, particularly when multiple agents
participate in one issue or PR. Follow the canonical commit, footer, label, comment, & handoff rules
in [agent attribution](agent-workflow.md#agent-attribution).

### Explicit approval & planning gates

These gates apply when requirements need further design or planning. Clear existing acceptance
criteria authorize implementation within that scope without another approval round.

1. **Design**: Explore intent, requirements, and subsystem impact before planning.
2. **Specification Gate**: For changes that need a written design, obtain explicit user approval on
   specifications before drafting implementation steps.
3. **Plan Gate**: For changes that need a written implementation plan, obtain explicit user approval
   before editing code.
4. **Commit Approved Artifacts**: Commit approved specifications and plans to Git _before_ starting
   the implementation work they describe.
5. **Execution Checkpoints**: Respect pause points and review checkpoints specified in execution
   plans.

---

## 4. Test-First Development & Test Matrix

Mistria Field Guide uses Vitest for unit testing across both application logic and data extraction
pipelines.

### Test-Driven Development (TDD) Lifecycle

1. **Red**: Write a failing unit test in `src/` or `pipeline/` that reproduces an issue or defines
   new behavior.
2. **Green**: Write the minimal implementation code necessary to pass the test.
3. **Refactor**: Clean up the implementation while maintaining passing tests.

### Test file placement

Tests sit next to the module they cover, so moving or deleting a module takes its test with it.

- **Unit & module tests** are siblings: `foo.ts` → `foo.test.ts`. Do not create `__tests__/`
  directories or mirror the source tree elsewhere.
- **Runtime or requirement variants** use a suffix, not a directory: `foo.client.test.ts` for
  browser-only tests, `foo.cold.test.ts` for tests that need an unloaded names cache,
  `foo.isolated.test.ts` & `foo.isolated.client.test.ts` for tests that mock or reset modules, and
  `foo.assets.test.ts` for tests that need game assets. `vite.config.ts` selects them by glob.
- **Large test files** split by suffix so they sort beside their source: `progress.test.ts` &
  `progress.renown.test.ts`. Two suffixes name a kind of check rather than a slice:
  `.invariants.test.ts` asserts properties every record of a data set must hold (for example
  `tracker-data.invariants.test.ts`), and `.completeness.test.ts` asserts that a data set has an
  entry for every key it should (for example `names.completeness.test.ts`).
- **Whole-app or repo-level suites** (accessibility, PWA, CI workflow checks, checks of
  `src/app.css` or other non-module files) live in top-level `tests/`, because they exercise the
  built app or the repository rather than one module.
- **Shared test helpers** live in `src/lib/test-utils/`; reuse them rather than copying a local
  builder or stub. [The testing inventory](testing-inventory.md#shared-helpers) lists them.

The committed `.vscode/settings.json` nests each test under its source in the VS Code explorer, so
colocated tests don’t double the length of directory listings. It also points the Vitest extension
at `node_modules/.bin/node`, the pinned Node that `pnpm install` links from `devEngines.runtime`.
Without it, the extension starts Vitest with whatever `node` is first on `PATH`, and
`require-pinned-node` (the first import in `vite.config.ts`) exits on any other release, which the
extension reports only as “There were errors during config load.” The ESLint extension gets the same
runtime through `eslint.runtime`: it otherwise runs on VS Code’s bundled Node, and
`eslint.config.js` loads `vite.config.ts` for the SvelteKit config, so the guard stops the ESLint
server too (“Server process exited with code 1”).

- Run `pnpm install` (or `node scripts/setup-worktree.ts` in a worktree) before opening the folder.
  Until the link exists, the extension fails to spawn `node_modules/.bin/node` (`ENOENT`).
- The extension honors `vitest.nodeExecutable` only with its default `vitest.shellType`,
  `child_process`. With `"vitest.shellType": "terminal"` in your user settings, it runs the
  terminal’s `PATH` node instead and fails the same way.
- On Windows, pnpm usually links the runtime in `node_modules\.bin` as shims (`node.cmd`,
  `node.ps1`, and an extensionless shell script), which the extension can’t spawn without a shell,
  so the committed value likely fails there. A user-level `vitest.nodeExecutable` can’t fix it,
  because VS Code applies the workspace’s `.vscode/settings.json` over user settings. Instead, edit
  the committed file locally & keep the edit out of commits:
  1. Print the pinned runtime’s real path with `pnpm exec node -p process.execPath`.
  2. Set `vitest.nodeExecutable` & `eslint.runtime` in `.vscode/settings.json` to that path.
  3. Run `git update-index --skip-worktree .vscode/settings.json`, so Git ignores the local edit.
     Undo it with `--no-skip-worktree` before pulling a change to that file, then reapply.

### Executing Tests

Start with the test file that covers the change, for every agent and every Vitest project:

- **Default: run one file** from any project:
  ```sh
  pnpm exec vitest run path/to/file.test.ts
  ```

For plain-Node tests under `eslint-rules/`, `scripts/`, & `tests/`, also select the project so
unrelated app projects don’t start their Cloudflare proxy & workerd before file filtering:

```sh
pnpm exec vitest run --project node scripts/guard-generated-reads.test.ts
```

Use `--project node-isolated` for `*.isolated.test.ts` in those directories, and
`--project pipeline` for asset-independent `pipeline/` tests. App tests, including
`*.client.test.ts` & `*.cold.test.ts`, can use the path-only command. The
[project table](#test-projects) lists every project.

Broaden only when the changed contracts require it. `test:changed` is a related-test helper, not a
guarantee of a focused run: its documented fallbacks below can run the complete suite. Full-suite
commands are references for CI or the explicit full-local-matrix exceptions in
[agent-verification.md](agent-verification.md); do not run them as a session baseline.

- **Run All Unit Tests** (asset-independent):
  ```sh
  pnpm run test
  ```
  This command passes in a fresh clone without `pipeline/input/`. CI runs the same suite through its
  `test:budgets` step (`node scripts/vitest-timings.ts`), which reports per-file timings & applies
  the [timing limits](#vitest-time-budgets).
- **Measure coverage** (opt-in; the same suite plus v8 coverage):
  ```sh
  pnpm run test:coverage
  ```
  Coverage covers `src/lib/engine/`, `src/lib/stores/`, & `pipeline/src/`. It's reported, not gated:
  the terminal prints a summary, `coverage/index.html` has per-line detail, and CI writes a per-area
  table with the least-covered files to the nightly test job's summary. PRs & main pushes run the
  suite without coverage (the cleanup test requires a change to its script); scheduled runs collect
  coverage. Plain `pnpm run test` and single-file runs don't measure coverage, so they cost nothing
  extra.
- **Run tests affected by branch changes**:

  ```sh
  pnpm run test:changed
  ```

  This compares committed, staged, modified, and untracked files with the local `origin/main` ref,
  then lets Vitest select related tests. If the comparison ref is unavailable, Git cannot enumerate
  the changes, or test configuration changes, the command explains why and runs the complete
  asset-independent suite instead. A branch with no changes prints that state explicitly instead of
  relying on Vitest's successful zero-test exit.

  `origin/main` is a local remote-tracking ref, so refresh it with `git fetch origin main` when it
  may be stale. A stale behind ref is conservative because it includes extra changed files, but
  `pnpm run test` remains the authoritative local fallback and the suite CI runs. Pass another
  comparison ref when needed, for example `pnpm run test:changed -- main`.

- **Run application tests only** (`src/`: the `app`, `isolated`, `cold`, `client`, &
  `client-isolated` projects):
  ```sh
  pnpm run test:app
  ```
  `pnpm run test:client` runs only the `client` & `client-isolated` projects.
- **Run data pipeline tests only** (`pipeline/`):
  ```sh
  pnpm run test:pipeline
  ```
  This command is also asset-independent.

### Vitest time budgets

CI runs the `test:budgets` step (`node scripts/vitest-timings.ts`) over every asset-independent
project. The cleanup test runs only when `scripts/cleanup-merged-worktrees.ts` changes: PRs use
their complete changed-file list, & main pushes compare the event’s before/after commits. Scheduled
& manual runs omit it. Pull requests also skip two groups of tests that they can’t affect:

| Tests                                | A pull request runs them when it changes                                                                                                                                         |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `relay/**`                           | `relay/**`, the relay test’s Vitest setup in `scripts/`, or a shared input                                                                                                       |
| `scripts/**`, except the three below | `scripts/**`, `pipeline/**`, `.github/workflows/**`, `.husky/**`, `.claude/settings.json`, `.codex/hooks.json`, `playwright*.config.ts`, `stylelint.config.*`, or a shared input |

The shared inputs are `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.node-version`,
`vite.config.*`, `tsconfig*`, & `.github/workflows/ci.yml`. Pipeline tests always run, since
pipeline code imports from `scripts/`. Three `scripts/` tests load the browser suites’ specs,
fixtures, or app modules, so they always run too: `playwright-allocation`, `playwright-satoshi`, &
`sprites/sprite-manifest`. Main pushes, scheduled runs, & manual dispatches run both groups. The
change detector sets `VITEST_RELAY_CHANGED` & `VITEST_SCRIPTS_CHANGED`, and `vite.config.ts` drops a
group only when its variable is `false`. A new `scripts/` test that reads app or test files needs
those paths in the filter or a place in the always-run list.

Direct local runs include every gated test, so test-only edits can be verified with the focused
command. The `test:budgets` step publishes all per-file test & hook durations, slowest first, in the
job summary & the `vitest-timings` artifact. Vitest uses half the available CPUs (at least one
worker, capped at four). The JSON also records CPU count, coverage mode, & whole-command wall time,
which includes imports, environment setup, transforms, startup, & report generation.

In CI, every Vitest project retries a failing test once; local runs do not retry by default. A
second failure still fails the run. The timing reporter warns with the full name of every test that
passes on retry, lists all retries in the summary, & records their counts & final results in
`timings.json`. A file with retries keeps its full duration but only warns on timing, since that
duration includes repeated attempts & hooks. Other files keep the limits below. For a focused
reporter run, pass a test path to `pnpm exec node scripts/vitest-timings.ts`. See
[the retry decision](decisions/2026-11-01-visible-vitest-retries.md).

A slow test costs time, not correctness, so timing fails a run only when the pull request can fix
it:

| A test file’s tests & hooks take                 | Pull request that changes the file | Anything else |
| ------------------------------------------------ | ---------------------------------- | ------------- |
| Up to 5 s                                        | Nothing                            | Nothing       |
| Over 5 s                                         | Warning                            | Warning       |
| Over 15 s (over 30 s for `relay/worker.test.ts`) | **Fails**                          | Warning       |

“Changes the file” means the test file itself is in the pull request’s changed files, so a new or
renamed file counts, as does each file that a slow one is split into. A source change that slows a
test it doesn’t edit only warns; the nightly report covers that case. The 15 s line sits well clear
of runner noise: one file measured 5.1–11.4 s across #13’s runs. Nothing else about timing fails a
run or kills Vitest. The job’s 10-minute timeout is the only bound on a hung suite. Missing timing
reports, invalid measurements, & unsuccessful tests still fail the step. Before this rule, ceilings
on wall time & every file failed 22 of 51 failed runs with no failed assertion; see
[the decision](decisions/2026-10-31-timing-limits-follow-the-diff.md).

The local Workers integration file, `relay/worker.test.ts`, has its own 30 s line for both warnings
& failures. It runs real workerd eviction, hibernating WebSocket closure, & SQLite runtime restarts,
with measured provider-runtime waits totaling about 20 seconds. Its sequencer starts this file first
within its pool, preserving the default order for all other files, so runtime waits overlap ordinary
tests even with a cold timing cache; see [the decision](decisions/2026-10-29-sync-relay.md).

Coverage runs nightly because local measurements do not establish that it is free in CI. Coverage
runs can’t fail on timing, because no pull request is involved.

On a failed pull request, “CI passed” notes jobs also failing on `main`’s latest completed,
non-cancelled push & links that run; this context never changes a check result or establishes a
shared cause.

### Nightly report

The scheduled CI run’s `nightly-report` job (`scripts/nightly-report.ts`) reads the `vitest-timings`
artifacts from up to 10 recent pushes to `main`, which run without coverage, & compares medians, so
one slow runner can’t raise a finding. It reports a file with at least 3 samples over its warning
line, or a median wall time over 120 s.

It also lists every retried test found in these artifacts, with its project, file, full name, retry
count, final result, & number of affected runs. Retries are reported even with only one timing
sample. Older artifacts without retry fields remain readable.

The job also runs `pnpm audit --audit-level=moderate --json` without installing dependencies. It
reports moderate-or-higher advisory entries after pnpm applies `auditConfig.ignoreGhsas`. The raw
metadata counts include accepted exceptions, so those counts don’t determine findings. An advisory
is a finding, not a scheduled-job failure; an audit that can’t run or returns unusable JSON fails
the job before changing the issue.

Findings live in one “Nightly CI report” issue. The job files it, edits it in place, & closes it
only when timings, retries, & advisories are clear. With one or two timing samples, it skips timing
findings but still reports advisories & retries, retaining earlier findings with a note that they
haven’t been rechecked. Repeated incomplete updates replace old advisories & status notes without
duplicating the retained warnings. A complete timing check replaces the earlier warnings with fresh
findings. Without advisories or retries & with too few timing samples, it leaves the issue alone.
With no readable timing samples, it publishes any advisories & then fails, because the timing report
can’t read its data. A failure to list timing runs also publishes any advisories before failing.
This job doesn’t count toward “CI passed”.

### Test projects

`vite.config.ts` splits Vitest into projects by what each test needs to run. A file path selects the
right tests, but does not prevent unrelated app projects from starting their Cloudflare proxy &
workerd before filtering. For focused plain-Node runs, pass both the file path & `--project` as
described [above](#executing-tests). Select a whole project with
`pnpm exec vitest run --project=<name>`.

| Project           | Files                                                              | Environment & setup                                          |
| ----------------- | ------------------------------------------------------------------ | ------------------------------------------------------------ |
| `app`             | `src/**/*.test.ts`                                                 | Node, SvelteKit stand-ins & preloaded names, shared registry |
| `isolated`        | `src/**/*.isolated.test.ts`                                        | As `app`, isolated per file                                  |
| `cold`            | `src/**/*.cold.test.ts`                                            | Node, isolated per file, no names preload                    |
| `client`          | `src/**/*.client.test.ts`                                          | happy-dom & Testing Library, shared registry                 |
| `client-isolated` | `src/**/*.isolated.client.test.ts`                                 | As `client`, isolated per file                               |
| `pipeline`        | `pipeline/**/*.test.ts`                                            | Plain Node without the app's Vite plugins, shared registry   |
| `node`            | `*.test.ts` under `eslint-rules/`, `scripts/`, & `tests/`          | Plain Node without the app's Vite plugins, shared registry   |
| `node-isolated`   | `*.isolated.test.ts` under `eslint-rules/`, `scripts/`, & `tests/` | As `node`, isolated per file                                 |
| `assets`          | `**/*.assets.test.ts`                                              | Installed game assets; local only, excluded from `test`      |

Every project restores spies, stubbed globals, & stubbed environment variables before each test. Set
up spies and `vi.stubGlobal()` in the test or `beforeEach`, rather than relying on suite-level
stubs. A new tier gets its own project rather than another entry in an exclude list.

Projects marked “shared registry” reuse one module graph per worker rather than re-importing tracker
data, names, & Svelte for every file; that import & setup work was most of the `app` & `client`
projects’ time (#707). Module-level state therefore carries between files in a worker: reset it in
`beforeEach`, as the store tests do. A module mock would leak the same way, so a test that calls
`vi.mock()`, `vi.doMock()`, or `vi.resetModules()` uses the `*.isolated.test.ts` suffix
(`*.isolated.client.test.ts` for happy-dom tests) and runs in `isolated`, `node-isolated`, or
`client-isolated`; the pipeline has no isolated project yet. `tests/vitest-isolation.test.ts`
enforces that. `client` files also share a happy-dom document: the client setup empties
`document.body` after each file, and a test that attaches nodes outside Testing Library's containers
removes them itself. Tests that need an unloaded names cache use the `*.cold.test.ts` convention and
run in `cold` without preloads. `tests/vitest-projects.test.ts` fails when a tracked test file
belongs to no project or to more than one.

### Local real-data verification

Changes to the pipeline parser, evaluator, extractors, or shared tracker-data contract require two
additional local checks against the installed game assets:

```sh
pnpm run test:pipeline:assets
pnpm run pipeline:assets
```

`test:pipeline:assets` validates the canonical fixture against one source per platform. On Windows
it reads Steam's installed `Fields of Mistria/assets.zip`, materializing only structured TOML; never
unpack the full archive without explicit approval. On macOS & Linux it reads
`pipeline/input/vX.Y.Z/assets` for the committed tracker data's version. Neither platform falls back
to the other's source, so a machine without its own fails the run rather than testing something
else. Set `MISTRIA_ASSETS=/path/to/assets` or `MISTRIA_ASSETS=/path/to/assets.zip` to use another
test input. The full pipeline currently requires an extracted assets root via its positional
argument or `MISTRIA_ASSETS`; when `misc.version` is absent, pass `--version=X.Y.Z`. It regenerates
`src/lib/data/tracker-data.json`; review that diff before committing. CI cannot run either command
because licensed game assets are not distributed with the repository.

The commands above cover routine regeneration from the same game version. When moving pipeline input
to a new Fields of Mistria version, follow the
[game version update protocol](game-version-update-protocol.md) instead. It requires a semantic data
diff and separate compatibility decisions for persisted state, backups, save imports, and transfers.

---

## 5. Verification matrix

The contract is stated in [verification policy](agent-verification.md): focused checks locally, the
complete matrix in CI on every pull request, and the full local matrix only for the listed
exceptions. This section is the command reference.

### During development

Confirm each command’s own exit status. A pipeline such as `command | tail` reports `tail`’s status,
so capture verbose output to a temporary log & inspect its tail separately, or use `set -o pipefail`
when filtering inline (see [agent-verification.md](agent-verification.md#exit-status)).

Run only the specific test covering your change:

```sh
pnpm exec vitest run path/to/file.test.ts
```

After a TypeScript or Svelte contract edit that could cause type errors elsewhere, also run:

```sh
pnpm run check
```

Run `pnpm run lint:fix` before committing. Do not run `pnpm run test`, `pnpm run build`, or any
other full-suite command during development.

### CI

`.github/workflows/ci.yml` runs on every pull request and main push. The steps it runs are the ones
`STEPS` lists in [scripts/verify.ts](../scripts/verify.ts), each naming its CI job; a job runs a
step with `pnpm run verify -- --step=<name>`. Add or change a step there, not by copying a command
into the workflow, & give a new step both a `STEPS` entry & its `--step` line in `ci.yml` (the CI
test fails until both exist). Some steps run only in CI: the scoped audit, the budgeted Vitest run
(file timing limits, coverage only nightly), & the pull-request-only stale-translation check are
outside the default `verify` matrix.

The audit blocks pull requests & main pushes only when they change `package.json`, `pnpm-lock.yaml`,
`pnpm-workspace.yaml`, or `.github/workflows/ci.yml`. For example, a CSS-only pull request skips the
audit; a lockfile change still fails on a moderate-or-higher advisory. Manual dispatches always
audit. Scheduled advisories go to the [nightly report](#nightly-report). The local opt-in audit
step, `pnpm run verify -- --step=audit`, stays available.

`.github/workflows/ci.yml` also runs the accessibility and PWA Playwright suites against the build
job's output when `src/`, `static/`, `tests/`, or their configs change; see
[accessibility testing](accessibility-testing.md) and [PWA verification](pwa-verification.md). Its
“CI passed” job aggregates the merge checks & accepts skipped audits, locale-sync, & browser jobs.
Scheduled reporting jobs stay outside that gate, so it is the one check to require for merging.

### Linting & formatting

`pnpm run lint` runs five tools, each covering what the others can't:

| Tool       | Config                | Covers                                                                                                              |
| ---------- | --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| oxfmt      | `.oxfmtrc.json`       | Formatting, import-statement sorting, & Tailwind class sorting, in every file type                                  |
| oxlint     | `.oxlintrc.json`      | Every script, including `.svelte` `<script>` blocks; type-aware rules through tsgolint                              |
| ESLint     | `eslint.config.js`    | `.svelte` & `.svelte.{js,ts}` only: eslint-plugin-svelte, template-aware unused variables, & `no-hardcoded-ui-text` |
| Stylelint  | `stylelint.config.js` | Scoped CSS; see [styling](styling.md#lint-rules)                                                                    |
| ShellCheck | `.shellcheckrc`       | Every tracked `*.sh`, through `pnpm run lint:shell`, which uses the system `shellcheck`                             |

oxlint enables every category except `nursery`, with the `eslint`, `typescript`, `unicorn`, `oxc`,
`import`, `promise`, `node`, & `jsdoc` plugins (plus `vitest` for `*.test.ts`), and adds
typescript-eslint's strict & stylistic type-checked rules and eslint-plugin-perfectionist (as an
oxlint JS plugin) for sorting object keys, types, unions, & named imports and exports. Because whole
categories are on, an oxlint upgrade that adds rules fails lint until each new rule is fixed or
turned off with a reason. Every `off` in `.oxlintrc.json` carries a one-line reason; see
[oxlint rule decisions](#oxlint-rule-decisions).

#### Test rules

oxlint owns every test rule; no ESLint plugin is needed, because oxlint ships the Vitest rules
natively and loads `eslint-plugin-playwright` as a JS plugin (the same way as perfectionist).

| Rule                             | Owner                                 | Scope                                                    |
| -------------------------------- | ------------------------------------- | -------------------------------------------------------- |
| `vitest/expect-expect`           | oxlint, built in                      | `*.test.ts`; `expect*` helpers count                     |
| `vitest/no-conditional-expect`   | oxlint, built in                      | `*.test.ts`                                              |
| `playwright/no-wait-for-timeout` | `eslint-plugin-playwright`, in oxlint | `tests/**/*.spec.ts`, `tests/pwa`, accessibility helpers |
| `playwright/no-raw-locators`     | `eslint-plugin-playwright`, in oxlint | Same, except the three files below                       |

Wait with `expect(...).toBeVisible()`, `expect.poll`, or `settledBox`, never a sleep. Prefer
`getByRole`, `getByLabel`, and `getByTestId`. Where a role can't express the query (an anchor id, a
decorative `data-*` hook), put the raw locator in a helper or add a one-line
`oxlint-disable-next-line playwright/no-raw-locators -- reason`. `geometry.spec.ts`, `seo.spec.ts`,
and `support/geometry.ts` are exempt in `.oxlintrc.json`: they measure layout on `data-*` hooks and
read `<meta>` tags, which have no role or accessible name.

TypeScript's `noImplicitReturns` stands in for oxlint's `typescript/consistent-return`, which can't
see that an exhaustive `switch` returns on every path.

#### Tool ownership

`tests/lint-ownership.test.ts` lints the probes in `tests/lint-probes/` and pins this matrix, so a
boundary change fails a test instead of silently dropping coverage:

| Surface                    | Untyped oxlint rules | Type-aware oxlint rules | ESLint template rules |
| -------------------------- | -------------------- | ----------------------- | --------------------- |
| `.ts`                      | Yes                  | Yes                     | No                    |
| `.svelte.ts`               | Yes                  | Yes                     | No                    |
| `.svelte` `<script>` block | Yes                  | **No** (gap)            | No                    |
| `.svelte` template         | No                   | No                      | Yes                   |

Type-aware rules (`no-floating-promises`, `no-unsafe-*`, and so on) don't run inside `.svelte`
`<script>` blocks: tsgolint doesn't read `.svelte` files, and typed ESLint on them took over a
minute per run. `svelte-check` still type-checks them. Keep nontrivial async or loosely typed logic
in `.ts` or `.svelte.ts` modules, where the typed rules apply. When tsgolint gains Svelte support,
the probe test fails; that's the trigger to revisit this boundary.

The same test checks that oxfmt formats `.svelte` files. That needs `.oxfmtrc.json`'s `svelte`
option; without it, `oxfmt --check` skips every `.svelte` file without saying so.

ESLint's template rules include two local ones in `eslint-rules/`: `no-hardcoded-ui-text` (see
[localization](localization.md)) and `no-raw-internal-href`, which rejects literal internal routes
like `href="/about"` and accepts `localizedHref(...)` or any other expression. It replaces
`svelte/no-navigation-without-resolve`, which needs type information to recognize `localizedHref()`.

#### Oxlint rule decisions

Rules turned off in `.oxlintrc.json` fall into three groups:

- **Rejected:** conflicts with a convention this repo keeps on purpose (named exports, `null` from
  DOM APIs, oxfmt's output, and so on). The inline reason is the whole record; revisit only if the
  convention changes.
- **Contradicted:** a stricter or overlapping rule is on (`default-case` versus
  `switch-exhaustiveness-check`, for example).
- **Deferred:** worthwhile, but the backlog needs its own scoping. Each has a revisit condition:

| Rule                                             | Findings | Revisit when                                                               |
| ------------------------------------------------ | -------- | -------------------------------------------------------------------------- |
| `typescript/no-unsafe-type-assertion`            | 1,943    | A dedicated issue scopes the assertion backlog                             |
| `typescript/strict-boolean-expressions`          | 212      | After the assertion cleanup; many hits are `string \| undefined` checks    |
| `typescript/strict-void-return`                  | 81       | Callback-typing cleanup is scoped                                          |
| `typescript/consistent-return`                   | 27       | tsgolint treats exhaustive `switch` statements as returning                |
| `eslint/require-unicode-regexp`                  | 239      | A regex audit confirms the `u`/`v` flag changes no pattern's meaning       |
| `eslint/prefer-named-capture-group`              | 38       | Same audit                                                                 |
| `unicorn/no-useless-undefined`                   | 102      | `noImplicitReturns` settles explicit `return undefined` style              |
| `eslint/max-*`, `complexity`, `max-nested-calls` | 25–313   | Thresholds are chosen from the current distribution                        |
| `eslint/no-inline-comments`                      | 31       | Trailing-comment style (including this config's reasons) is decided        |
| `import/no-relative-parent-imports`              | 124      | `#lib`-style imports exist for `pipeline/` and `scripts/` too              |
| `import/max-dependencies`                        | 32       | Thresholds are chosen                                                      |
| `vitest/prefer-strict-equal`                     | 719      | Fixtures are audited for `undefined` properties that `toStrictEqual` sees  |
| `vitest/no-conditional-in-test`                  | 179      | Table-driven tests move to `it.each`                                       |
| `vitest/require-mock-type-parameters`            | 126      | Mocks are typed in a dedicated pass                                        |
| `vitest/prefer-import-in-mock`                   | 39       | Partial module mocks are typed (its `import()` form type-checks factories) |

`eslint/no-await-in-loop` is on everywhere except Playwright specs, whose awaits drive one page
through ordered steps. Elsewhere, an intentionally sequential loop carries a disable comment naming
why.

#### Lint timings

| Measurement                          | Before (#486) | After |
| ------------------------------------ | ------------- | ----- |
| `pnpm run lint`, cold ESLint cache   | 6.0 s         | 5.0 s |
| `pnpm run lint`, warm ESLint cache   | 3.3 s         | 3.3 s |
| CI "Run pnpm run lint" step (ubuntu) | 22 s          | TBD   |

Suppressions follow the tool that owns the rule. Use `// oxlint-disable-next-line <rule> -- reason`
for oxlint rules and `// eslint-disable-next-line svelte/<rule> -- reason` (or the
`<!-- eslint-disable ... -->` form in templates) for ESLint rules. In `.svelte` files, ESLint
reports an `eslint-disable` comment for a rule it doesn't run as unused, so use `oxlint-disable`
there for oxlint's rules. For ShellCheck, put `# shellcheck disable=SC<code> # reason` on the line
above the finding.

### Full local matrix

`pnpm run verify` runs CI's non-browser matrix locally (the default steps in `STEPS`,
[scripts/verify.ts](../scripts/verify.ts)) with live output, stopping on the first failure. It is
read-only: it runs `lint`, not `lint:fix`, so run `pnpm run lint:fix` beforehand. Opt-in flags add
the local-only steps: `pnpm run verify -- --assets` adds `test:pipeline:assets`, `--browser` adds
`test:accessibility` & `test:pwa`, and `--all` adds both. Run it once, when commit-ready, only for
the exceptions in [verification policy](agent-verification.md). If a step fails, fix the issue and
rerun only that step, then rerun `pnpm run verify` once.

The browser steps reuse the production build from the matrix via `PLAYWRIGHT_SKIP_BUILD=true`, so
`--browser` & `--all` build once. Standalone browser commands still build by default.

For a component change, run the journey for its route instead of the whole browser matrix:

```sh
pnpm exec playwright test tests/accessibility/routes.spec.ts --grep 'Villagers hydrates'
```

Replace `Villagers` with the route name from `tests/accessibility/routes.ts`. This checks hydration,
landmarks, light-mode axe, & dark-mode contrast on that route. Run the relevant interaction test
from `tests/accessibility/states.spec.ts` too when changing stateful behavior. If this checkout
already has a current production build, prefix the focused command with
`PLAYWRIGHT_SKIP_BUILD=true`; rebuild after app changes to avoid testing stale output.

Pipeline parser, evaluator, extractor, & shared data-contract changes must additionally pass
`pnpm run test:pipeline:assets` (or `pnpm run verify -- --assets`) and the pipeline run described in
§4. Those are local-only because CI has no game assets.

### Documentation-only changes

Changes that touch only `.md` files, comments, or non-executable content need only:

```sh
pnpm run lint:fix && pnpm run lint
```

No build, no tests. `pnpm run prepare` generates `.svelte-kit/tsconfig.json`; if oxlint reports it
missing (lifecycle scripts skipped), run `pnpm exec svelte-kit sync` first.

> [!IMPORTANT] Git pre-commit hooks are developer conveniences, not verification evidence. Agents
> must run the documented commands directly in their shell and verify clean exit status before
> committing work.

### Required branch/PR delivery check before handoff

Before reporting task completion, confirm your commits are on the branch that backs the target PR:

```sh
git branch --show-current
git branch -vv
```

- Ensure `git branch --show-current` matches the PR branch name.
- Ensure `git branch -vv` shows that branch tracking the expected `origin/<branch>`.
- Push through the agent delivery mechanism (for example, Copilot cloud runs push with their
  `report_progress` tool; elsewhere use `git push`) after committing, then verify the branch is
  clean with `git status --short`.

### Force-push only over the commit you expect

After rebasing a pushed branch, name the remote commit you expect to replace:

```sh
git push --force-with-lease=<branch>:<full-sha-you-last-saw> origin <branch>
```

A bare `--force-with-lease` compares against your local `origin/<branch>`, so any fetch after
someone else's push makes the lease pass and silently discards their commit. That happened on a PR
the maintainer had pushed to while an agent was rebasing it. Take the SHA from the PR (for example
`gh pr view <n> --json headRefOid`) before rebasing. If the push is rejected, the branch moved: stop
and report rather than fetching and retrying. Never use plain `--force`.

### Set work aside without the shared stash

Linked worktrees share one `refs/stash`, so stash indexes and the default `stash@{0}` point at
whichever session stashed last. A bare `git stash apply` once restored a concurrent session's patch
into the wrong worktree (#597). Set work aside with a temporary commit instead:

```sh
git add -A && git commit -m "WIP: set aside" --no-verify
git reset --soft HEAD~1   # when resuming
```

If you must stash, give the entry a unique message, record its commit ID immediately, and address it
only by that ID:

```sh
git stash push -u -m "<unique-tag>"
git stash list --format='%H %gs' | grep '<unique-tag>'
git stash show --stat <sha>   # confirm the file set before applying
git stash apply <sha>
```

Never use bare `pop`, `apply`, or `drop`. To drop the entry afterward, re-find its current
`stash@{n}` by tag first, since other sessions shift the indexes.

### Preview from a worktree

The Claude Code desktop app resolves `.claude/launch.json` & the named server's working directory
against the session's original folder, not the checkout the agent is working in (#82). Calling
`preview_start` with `name: "dev"` therefore serves the wrong code in two cases:

- A subagent spawned with `isolation: "worktree"` gets the orchestrator's checkout, since subagents
  share the session's folder.
- A session that started in the main checkout and moved into a `.worktrees/<branch>` worktree
  (created by `pnpm run worktree:new`) gets the main checkout.

The preview loads & looks healthy either way, so a visual check passes against code the branch never
changed. Any agent previewing from a worktree starts its own dev server instead:

1. From the worktree, start Vite in the background on a port no other session uses
   (`pnpm exec vite dev --port 5180 --strictPort`; pick another port if it's taken).
2. Open it with `preview_start` and a `url` (`http://localhost:5180`), never a `name`.
3. Before checking anything, unregister stale service workers. Dev servers don’t register workers;
   local builds & deployed previews do. A worker previously registered on the same origin can still
   serve its cached pages, including the offline fallback. Run this in the page with
   `javascript_tool`, then reload:

   ```js
   for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
   ```

4. Confirm the server serves the worktree's code. Vite dev serves source modules by path, so pick a
   file the branch changed (`git diff --name-only $(git merge-base origin/main HEAD)` lists tracked
   changes, including uncommitted ones; `git ls-files --others --exclude-standard` lists new files)
   & a fragment only the branch has. The `?raw` suffix returns the file as written rather than
   compiled, as a JS string, so choose a fragment without quotes or backslashes:

   ```js
   (await (await fetch("/src/<changed-file>?raw")).text()).includes("<branch-only fragment>");
   ```

   If it returns `false`, the preview is serving another checkout; stop it & recheck step 1.

5. Stop the server when the check is done.

### Attach visual evidence & prototype code

Use `--attach` when adding screenshots to GitHub CLI-created issues, pull requests, or pull-request
comments. The flag can be repeated. On its own, `--attach` appends each image to the end of the
body, after the final `Agent:` line, which fails the "Attribution" check. Reference every attached
file in the body above that line instead; GitHub CLI rewrites each local reference to the uploaded
asset and appends nothing:

```markdown
## Screenshots

![Desktop tracker view](./desktop.png) ![Mobile tracker view](./mobile.png)

Agent: claude-code
```

```sh
gh pr create --body-file body.md --attach ./desktop.png --attach ./mobile.png
```

Keep useful prototype code available to reviewers in a collapsed `<details>` element:

````markdown
<details>
<summary>Prototype implementation</summary>

```ts
// Relevant prototype excerpt.
```

</details>
````

### Clean merged local branches & worktrees

Run the cleanup helper from the repository root to preview eligible removals:

```sh
pnpm run worktree:cleanup
```

Pass `--apply` (`pnpm run worktree:cleanup -- --apply`) only after reviewing the preview. The helper
removes a local branch only when its current commit exactly matches the head commit of a merged
GitHub pull request, and it has no open pull request. It removes an associated worktree only when
that worktree is clean; Git itself still must accept the removal. It leaves every other branch and
worktree alone.

Before checking branches, it prunes unlocked worktree registrations whose directory no longer exists
(such as Codex worktrees under a cleared `/tmp`), so their branches get the same checks as any
other. If a stale registration's parent directory is also missing, as on an unmounted volume, it
prunes nothing and says so; lock that worktree or prune by hand. A tip that GitHub has never
received is unpushed work and stays, unless it is a conflict-free two-parent merge (typically
`origin/main` merged into a PR head for a local check) whose parents both count as merged.

It also keeps any worktree in use: one that a running process (an agent session or its shell) has as
its working directory, or, with `--idle-minutes <n>`, one whose `HEAD` changed in the last `n`
minutes. A fresh agent worktree's tip is already in `origin/main`, so unattended runs rely on this.

On Windows the helper queries `Win32_Process` through noninteractive PowerShell & keeps worktrees
referenced by absolute executable or command-line argument paths, including dev servers & workerd.
This cannot discover a process whose only connection is its working directory, or whose paths are
inaccessible, so also pass `--idle-minutes` to spare recent live sessions. If process enumeration
fails, the helper reports that only the invoking worktree & idle window protect live sessions. Git
for Windows deregisters a removed worktree but leaves its junctions & pnpm's `node_modules` links
behind; the helper then deletes what's left without following those links. It also enables
`core.longpaths` for the removal, so deep `node_modules` paths don't stop it.

### Automatic housekeeping

Two mechanisms keep the primary checkout current without manual cleanup:

- **Session start:** Claude Code (`.claude/settings.json`) and Codex (`.codex/hooks.json`) run
  `scripts/refresh-default-branch.sh` when a session starts. It fast-forwards local `main` (in
  whichever worktree has it checked out, or as a bare ref) and never fails the session. Codex skips
  a new or changed project hook until you trust it in its hook review.
- **Hourly on macOS:** `pnpm run housekeeping:install`, run from the primary checkout, installs a
  launchd agent that runs `scripts/housekeeping.sh` hourly: refresh `main`, then
  `cleanup-merged-worktrees.ts --apply --idle-minutes 120`. It logs to
  `~/Library/Logs/mistria-housekeeping.log` and holds a lock so overlapping runs skip. The agent's
  `PATH` records the directory of the `node` that installed it; rerun the install after removing
  that Node version. Remove it with `pnpm run housekeeping:install -- --uninstall`.

---

## 6. Troubleshooting & Recovery Steps

Production service-worker behavior has a separate browser verification procedure in
[the PWA verification guide](pwa-verification.md). Run `pnpm run test:pwa` when changing caching,
offline fallback, registration, or activation behavior.

### `svelte-check` Reports Missing or Outdated SvelteKit Types

- **Symptom**: Type errors on `$app/*` imports or route data after pulling changes or altering
  routes.
- **Recovery**: Run `pnpm run check` (or `pnpm exec svelte-kit sync`), which generates
  `.svelte-kit/tsconfig.json` and syncs types before type-checking.

### Missing `pipeline/input/` Assets During Pipeline Execution

- **Symptom**: Pipeline command fails with missing directory errors for game assets.
- **Recovery**: Symlink the read-only asset folder from the primary repository checkout:
  ```sh
  ln -s /path/to/main/repo/pipeline/input pipeline/input
  ```

### Out-of-Sync Generated Data (`tracker-data.json`)

- **Symptom**: App UI displays stale item fields after pipeline extractor logic updates.
- **Recovery**: Run the pipeline with local game assets to regenerate the target dataset:
  ```sh
  pnpm run pipeline:assets
  ```
  Review `git diff src/lib/data/tracker-data.json` to verify schema and data accuracy.

### Git Hook Permission or Execution Failures in Worktrees

- **Symptom**: Pre-commit hooks fail or block commits inside isolated worktree environments.
- **Recovery**: Prefer fixing hook execution. If a Git hook must be bypassed
  (`git commit --no-verify`), first run `pnpm run lint:fix`, the focused checks from §5, and
  `node scripts/check-attribution.ts --commit-msg <message-file>` directly, and confirm clean exit
  status. Keep the required attribution trailer; CI still runs the full matrix on the PR. This does
  not authorize bypassing a refused harness edit or weakening an approval policy.

### CI Doesn't Start on a New PR

- **Symptom**: A newly opened PR shows only "Attribution" and "Guarded paths"; no "CI" run exists
  and the PR stays blocked.
- **Cause**: Unconfirmed. On #622–#625, opened within minutes of each other, GitHub started the
  other workflows for the `opened` event but not `ci.yml` (#626).
- **Recovery**: Push an empty commit; its `synchronize` event starts CI.
  ```sh
  gh run list --workflow ci.yml --branch "$(git branch --show-current)" --limit 1
  git commit --allow-empty -m "Retrigger CI" -m "Co-Authored-By: <your agent trailer>" && git push
  ```

### Missing Husky Hooks After Worktree Setup

- **Symptom**: Pre-commit hooks are absent in a fresh worktree — commits pass without lint or
  formatting checks running.
- **Cause**: Lifecycle scripts (including `prepare`) may be disabled or skipped in some
  environments. `core.hooksPath` is stored in the shared `.git/config` and may already be set by
  another worktree, but the `.husky/_` directory that Husky generates is worktree-local and will be
  absent until `prepare` is run. A parallel setup can also hold the shared `.git/config` lock;
  `scripts/install-git-hooks.ts` retries Husky's install, and `prepare` fails with the lock error if
  it never frees.
- **Recovery**: Run `pnpm run prepare` from within the worktree directory after installation:
  ```sh
  pnpm run prepare
  ```
  Verify installation by confirming `core.hooksPath` is set to `.husky/_` and the Husky wrapper
  exists:
  ```sh
  git config --get core.hooksPath   # should print .husky/_
  ls .husky/_/pre-commit            # should exist
  ```

### Worktrees & Verification on Windows

`worktree:new`, `scripts/setup-worktree.ts`, & `verify` are Node scripts (`scripts/*.ts`), so
Windows runs them without a shell. The earlier Bash versions failed there (#353): from `cmd.exe`,
`bash` can resolve to WSL, whose Git records a `/mnt/c/...` gitdir that Git for Windows reports as
prunable and whose launcher can outlive `verify`'s child without returning its exit status, while
Git Bash's `ln -s` copies or fails instead of linking.

- **Links**: setup links `pipeline/input/` & each `.worktreeinclude` entry that exists in the main
  checkout and skips the rest. On Windows, directories become junctions, which need neither
  administrator rights nor Developer Mode. Files become symlinks where Windows allows them and hard
  links otherwise; an editor that saves by replacing the file breaks a hard link, so edit `.env` in
  the main checkout.
- **Leftover junctions**: Git for Windows' `git worktree remove` unregisters a worktree but leaves
  its junctions behind, and without `git config --global core.longpaths true` it stops with
  `Filename too long` inside `node_modules`. Delete the leftover directory with
  `node -e "require('fs').rmSync(process.argv[1], { recursive: true, force: true })" <path>`, which
  unlinks a junction without following it, rather than a tool that might recurse into the target.
- **Restricted PowerShell**: if the execution policy blocks `pnpm.ps1`, run `pnpm.cmd` instead (for
  example `pnpm.cmd run verify`) or use Git Bash.
- **Inline scripts**: pnpm's Windows shim rejects quoted inline code, so `pnpm exec node -e "…"`
  fails with `batch file arguments are invalid`. Write the script to a file and run
  `pnpm exec node <file>` instead.
- **Phantom modifications**: a checkout whose index predates `* text=auto eol=lf` caches CRLF file
  sizes, so after a formatter touches a file `git status` can show it modified while `git diff` is
  empty & `git update-index --refresh` cannot clear it. Run `git add --renormalize .` once (it
  changes no blobs), or clone fresh.
