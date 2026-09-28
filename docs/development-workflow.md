# Development Workflow Guide

> Detailed workflow reference for Mistria Field Guide development, including setup, worktree
> management, planning, test-driven development, and verification.

---

## 1. Local Setup Requirements

- **Node.js**: Requires Node `>=26.0.0 <27.0.0` (as defined in `package.json`).
- **Package Manager**: Use **pnpm** exclusively. Do not use `npm`, `npx`, `yarn`, or `bun`.
- **Dependency Installation**:
  ```sh
  pnpm install --frozen-lockfile
  ```
- **Environment Configuration**: Copy `.env.example` to `.env` if local environment variables are
  required.
- **Cloud agents**: Configure Claude Code cloud and Codex cloud with the shared setup script and
  read-only Cloudflare access in [cloud-agent-environments.md](cloud-agent-environments.md).

---

## 2. Git Worktree Mechanics & Workspace Isolation

All agents must operate within an isolated Git worktree to prevent edit collisions, dirty-state
confusion, and branch switching interference across concurrent sessions.

### Worktree creation

Create and set up a worktree from any checkout with one command:

```sh
pnpm run worktree:new <issue-number>-<short-description>
```

The script creates `.worktrees/<slug>` on a matching branch under the main checkout, refuses to run
if `.worktrees/` is not gitignored, symlinks every `.worktreeinclude` entry from the main checkout,
and runs `pnpm install --frozen-lockfile` and `pnpm run prepare` (Husky hooks, Paraglide output, &
`svelte-kit sync`). Agents with their own managed worktree directory (for example
`.claude/worktrees/`) may use it instead; the same symlink and install steps still apply.

<details>
<summary>Manual fallback</summary>

```sh
git check-ignore -q .worktrees/placeholder
git worktree add .worktrees/<slug> -b <slug>
cd .worktrees/<slug>
ln -s /path/to/main/repo/pipeline/input pipeline/input
pnpm install --frozen-lockfile
pnpm run prepare
```

</details>

### Shared vs. Isolated Worktree Resources (`.worktreeinclude`)

The `.worktreeinclude` file lists ignored local entries required for development:

- **`pipeline/input/`** (Game TOML assets, ~114 MB): Shared read-only resource. Create a symbolic
  link from the primary checkout to avoid duplicating assets:
  ```sh
  ln -s /path/to/main/repo/pipeline/input pipeline/input
  ```
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
- Identify affected contracts, tests, generated files, and documentation before editing.
- Use the smallest process that fits the change. Small, well-specified maintenance work does not
  require a separate specification or implementation plan.

### Claim & release issue ownership

Issue ownership uses two labels because every agent operates through the repository owner's GitHub
account:

- `status: in progress` identifies all active work.
- Exactly one `agent:*` label identifies the top-level agent responsible for it: `agent: claude`,
  `agent: codex`, `agent: antigravity`, `agent: kilo`, `agent: copilot`, or `agent: lm studio`.

Follow this protocol for every issue-backed task:

1. Refresh the issue immediately before claiming it. Do not start issues marked `status: blocked` or
   `status: needs decision`. If `status: in progress` or an `agent:*` label is already present,
   coordinate with the current owner instead of starting duplicate work.
2. Complete the applicable scope, specification, & plan approval gates.
3. Immediately before setup or implementation, remove the issue's current `status:*` label, add
   `status: in progress`, & add exactly one `agent:*` label for the top-level orchestrator.
   Subagents inherit that identity rather than claiming the issue separately.
4. Keep both active-work labels while implementation, verification, & PR review remain active.
5. On handoff, replace the existing `agent:*` label with the receiving agent's label. Do not leave
   multiple agent labels on an issue.
6. When the issue closes, remove `status: in progress` & the `agent:*` label. If work stops without
   closing the issue, remove both active-work labels & set exactly one accurate status:
   `status: ready`, `status: blocked`, or `status: needs decision`.

An active-work label is a coordination claim, not proof of progress. Do not claim issues merely to
reserve them, & do not leave stale claims after an agent stops working.

Filing an issue does not claim it. The filer adds the required `Agent:` authorship line, leaves the
issue without an `agent:*` label, and applies a non-active status such as `status: ready` when the
issue is already triaged. Add the ownership label only when an agent later completes the approval
gates and begins the claim protocol above.

### Attribute agent-authored content

Attribution records authorship separately from active ownership, particularly when multiple agents
participate in one issue or PR. Follow the canonical commit, footer, label, comment, & handoff rules
in [AGENTS.md](../AGENTS.md#agent-attribution).

### Explicit Approval & Planning Gates

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
  browser-only tests and `foo.assets.test.ts` for tests that need game assets. `vite.config.ts`
  selects them by glob.
- **Large test files** split by suffix so they sort beside their source: `progress.test.ts` &
  `progress.renown.test.ts`.
- **Whole-app or repo-level suites** (accessibility, PWA, CI workflow checks) live in top-level
  `tests/`, because they exercise the built app or the repository rather than one module.

The committed `.vscode/settings.json` nests each test under its source in the VS Code explorer, so
colocated tests don’t double the length of directory listings.

### Executing Tests

- **Run All Unit Tests** (asset-independent):
  ```sh
  pnpm run test
  ```
  This command passes in a fresh clone without `pipeline/input/` and is the test command CI runs.
- **Run Application Logic Tests Only** (`src/`):
  ```sh
  pnpm run test:app
  ```
- **Run Data Pipeline Tests Only** (`pipeline/`):
  ```sh
  pnpm run test:pipeline
  ```
  This command is also asset-independent.

### Test projects

`vite.config.ts` splits Vitest into projects by what each test needs to run. Select one with
`pnpm exec vitest run --project=<name>`.

| Project  | Files                                                 | Environment & setup                                         |
| -------- | ----------------------------------------------------- | ----------------------------------------------------------- |
| `app`    | `src/**/*.test.ts`                                    | Node, SvelteKit stand-ins & preloaded names, shared modules |
| `mocked` | The few `src/` files listed in `isolatedTests`        | Node, isolated per file, no names preload                   |
| `client` | `src/**/*.client.test.ts`                             | happy-dom & Testing Library                                 |
| `node`   | `*.test.ts` under `pipeline/`, `scripts/`, & `tests/` | Plain Node, shared modules                                  |
| `assets` | `**/*.assets.test.ts`                                 | Installed game assets; local only, excluded from `test`     |

A new tier gets its own project rather than another entry in an exclude list. A test that needs
per-file module isolation (for example, `vi.mock()` of a shared package) goes in `isolatedTests`.

### Local real-data verification

Changes to the pipeline parser, evaluator, extractors, or shared tracker-data contract require two
additional local checks against the installed game assets:

```sh
pnpm run test:pipeline:assets
pnpm run pipeline -- input/assets --version=1.0.5
```

`test:pipeline:assets` validates the canonical v1.0.5 fixture and fails when its resolved assets
path is missing. On Windows the test defaults to Steam's `Fields of Mistria/assets.zip` and
materializes only structured TOML; never unpack the full archive without explicit approval. Set
`MISTRIA_ASSETS=/path/to/assets` or `MISTRIA_ASSETS=/path/to/assets.zip` to use another test input.
The full pipeline currently requires an extracted assets root via its positional argument or
`MISTRIA_ASSETS`; when `misc.version` is absent, pass `--version=X.Y.Z`. It regenerates
`src/lib/data/tracker-data.json`; review that diff before committing. CI cannot run either command
because licensed game assets are not distributed with the repository.

The commands above cover routine regeneration from the same game version. When moving pipeline input
to a new Fields of Mistria version, follow the
[game version update protocol](game-version-update-protocol.md) instead. It requires a semantic data
diff and separate compatibility decisions for persisted state, backups, save imports, and transfers.

---

## 5. Verification matrix

The contract is stated in [AGENTS.md §7](../AGENTS.md#7-verification): focused checks locally, the
complete matrix in CI on every pull request, and the full local matrix only for the listed
exceptions. This section is the command reference.

### During development

Run only the specific test covering your change:

```sh
pnpm exec vitest run path/to/file.test.ts 2>&1 | tail -30
```

After a TypeScript or Svelte contract edit that could cause type errors elsewhere, also run:

```sh
pnpm run check 2>&1 | tail -10
```

Run `pnpm run lint:fix` before committing. Do not run `pnpm run test`, `pnpm run build`, or any
other full-suite command during development.

### CI

`.github/workflows/ci.yml` runs on every pull request and main push:

| Command                 | Description & Purpose                                                            | Scope                |
| ----------------------- | -------------------------------------------------------------------------------- | -------------------- |
| `pnpm run lint`         | Checks formatting, ESLint, and Stylelint compliance                              | All files            |
| `pnpm run check:i18n`   | Verifies every locale file matches `en.json`'s key shape                         | `messages/`          |
| `pnpm run check`        | Synchronizes SvelteKit types and runs `svelte-check` plus the pipeline `tsc`     | `src/` & `pipeline/` |
| `pnpm run test`         | Executes the complete Vitest test suite                                          | Unit & logic tests   |
| `pnpm run build`        | Compiles SvelteKit app and verifies Cloudflare adapter                           | Build validation     |
| `pnpm run check:routes` | Proves every built static asset bypasses Cloudflare Functions via `_routes.json` | Build validation     |

`.github/workflows/browser-tests.yml` adds the accessibility and PWA Playwright suites when `src/`,
`static/`, `tests/`, or their configs change; see [accessibility testing](accessibility-testing.md)
and [PWA verification](pwa-verification.md).

### Full local matrix

`pnpm run verify` runs the `ci.yml` matrix locally (plus `lint:fix` first) with compact output,
stopping on the first failure. Run it once, when commit-ready, only for the exceptions in
[AGENTS.md §7](../AGENTS.md#7-verification). If a step fails, fix the issue and rerun only that
step, then rerun `pnpm run verify` once.

Pipeline parser, evaluator, extractor, & shared data-contract changes must additionally pass
`pnpm run test:pipeline:assets` and the pipeline run described in §4. Those are local-only because
CI has no game assets.

### Documentation-only changes

Changes that touch only `.md` files, comments, or non-executable content need only:

```sh
pnpm run lint:fix && pnpm run lint
```

No build, no tests. `pnpm run prepare` generates `.svelte-kit/tsconfig.json`; if ESLint reports it
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
- Push through the agent delivery mechanism (for Copilot runs, `report_progress`) after committing,
  then verify the branch is clean with `git status --short`.

### Attach visual evidence & prototype code

Use `--attach` when adding screenshots to GitHub CLI-created issues, pull requests, or pull-request
comments. The flag can be repeated, and image alt text follows the file path after `#`:

```sh
gh pr create --attach './desktop.png#Desktop tracker view' --attach './mobile.png#Mobile tracker view'
```

When the Markdown body already includes a local attachment reference, such as
`![Desktop tracker](./desktop.png)`, GitHub CLI replaces it with the uploaded asset. Keep useful
prototype code available to reviewers in a collapsed `<details>` element:

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
scripts/cleanup-merged-worktrees.sh
```

Pass `--apply` only after reviewing the preview. The helper removes a local branch only when its
current commit exactly matches the head commit of a merged GitHub pull request, and it has no open
pull request. It removes an associated worktree only when that worktree is clean; Git itself still
must accept the removal. It leaves every other branch and worktree alone.

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
  pnpm run pipeline -- input/assets --version=1.0.2
  ```
  Review `git diff src/lib/data/tracker-data.json` to verify schema and data accuracy.

### Git Hook Permission or Execution Failures in Worktrees

- **Symptom**: Pre-commit hooks fail or block commits inside isolated worktree environments.
- **Recovery**: Bypass hooks if necessary (`git commit --no-verify`), provided you have directly run
  `pnpm run lint:fix` and the focused checks from §5; CI still runs the full matrix on the PR.

### Missing Husky Hooks After Worktree Setup

- **Symptom**: Pre-commit hooks are absent in a fresh worktree — commits pass without lint or
  formatting checks running.
- **Cause**: Lifecycle scripts (including `prepare`) may be disabled or skipped in some
  environments. `core.hooksPath` is stored in the shared `.git/config` and may already be set by
  another worktree, but the `.husky/_` directory that Husky generates is worktree-local and will be
  absent until `prepare` is run.
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

### `worktree:new` Fails Partway Through on Windows

- **Symptom**: `pnpm run worktree:new` prints
  `ln: failed to create symbolic link '.../.worktrees/<slug>/.env': No such file or directory` and
  exits before running `pnpm install`/`pnpm run prepare`, leaving the worktree without dependencies
  installed.
- **Cause**: `scripts/new-worktree.sh` symlinks every `.worktreeinclude` entry, including bare
  filenames like `.env` and `.env.*` that only exist if the main checkout has them. On some Windows
  Git Bash setups, `ln -s` for a _file_ symlink to a nonexistent target fails outright (directory
  symlinks, like `pipeline/input/`, are unaffected), and the script's `set -euo pipefail` aborts the
  whole run right there — before the install step. This is a false alarm when the main checkout
  genuinely has no `.env`; there is nothing to symlink or fix.
- **Recovery**: Finish the two steps the script didn't reach, from inside the worktree directory:
  ```sh
  cd .worktrees/<slug>
  pnpm install --frozen-lockfile
  pnpm run prepare
  ```
  Re-run `git worktree list` first if you're unsure whether the worktree itself was created — the
  failure happens after `git worktree add` succeeds, so the branch and directory already exist.
