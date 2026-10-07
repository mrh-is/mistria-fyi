# Development Workflow Guide

> Detailed workflow reference for Mistria Field Guide development, including setup, worktree
> management, planning, test-driven development, and verification.

---

## 1. Local Setup Requirements

- **Node.js**: Use the version in `.node-version` (Node 24 LTS). Every environment, including CI and
  both cloud agents, runs Node 24 so tests match what agents run. `package.json` accepts 24.15 or
  later so Codex cloud can use its preinstalled patch release.
- **Package Manager**: Use **pnpm** exclusively. Do not use `npm`, `npx`, `yarn`, or `bun`.
- **Dependency Installation**:
  ```sh
  pnpm install --frozen-lockfile
  ```
- **pnpm launcher**: The `packageManager` field pins pnpm, and your installed pnpm downloads and
  runs that version. pnpm 12 ships as a native executable, which pnpm 11's launcher runs through
  Node and fails with `SyntaxError: Invalid or unexpected token` (#563). Before or when the pin
  moves to pnpm 12, upgrade the machine's pnpm itself to 12 (for example `pnpm self-update 12`, or
  your installer's equivalent). As a stopgap, put the downloaded native pnpm 12 executable first on
  `PATH` so nested scripts use it too. CI uses `pnpm/setup`, which installs the native binary
  directly and isn't affected.
- **Environment Configuration**: Copy `.env.example` to `.env` if local environment variables are
  required.
- **Cloud agents**: Configure Claude Code cloud and Codex cloud with the shared setup script and
  read-only Cloudflare access in [cloud-agent-environments.md](cloud-agent-environments.md).

---

## 2. Git Worktree Mechanics & Workspace Isolation

Agents that modify tracked files work in an isolated Git worktree to prevent edit collisions,
dirty-state confusion, and branch switching interference across concurrent sessions. Read-only work
and platform-isolated cloud sessions are exempt; see
[AGENTS.md §1](../AGENTS.md#1-worktree-isolation).

### Worktree creation

Create and set up a worktree from any checkout with one command:

```sh
pnpm run worktree:new <issue-number>-<short-description> [starting-branch]
```

The script validates the slug (`<issue-number>-<short-description>`, lowercase), fetches the
starting branch (default `main`), creates `.worktrees/<slug>` on a matching branch from the
refreshed `origin/<starting-branch>` under the main checkout, removes the worktree & branch again if
a later step fails, refuses to run if `.worktrees/` is not gitignored, symlinks every
`.worktreeinclude` entry from the main checkout, and runs `pnpm install --frozen-lockfile` and
`pnpm run prepare` (Husky hooks, Paraglide output, & `svelte-kit sync`). The symlink & install steps
live in `scripts/setup-worktree.sh`, which skips entries already present.

Before creating the harness worktree, fetch the intended starting branch and use its refreshed
remote tip as the base. Setup installs dependencies; it does not move an existing worktree or
refresh its base. When working directly on a starting branch, pull with `git pull --ff-only` before
edits; stop on divergence rather than resetting existing work.

Agents with their own managed worktree directory (for example `.claude/worktrees/`) may use it
instead; run the setup steps from inside it:

```sh
pnpm run worktree:setup
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
keeping `sandbox_mode = "workspace-write"`, `approval_policy = "on-request"`, and
`approvals_reviewer = "user"`. Git-metadata operations can request a narrow escalation; command
allowlists in `.codex/rules/default.rules` do not grant filesystem or network access. If the active
managed environment disallows escalation, report the limitation rather than weakening the sandbox or
bypassing isolation.

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
  browser-only tests, `foo.cold.test.ts` for tests that need an unloaded names cache, and
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
colocated tests don’t double the length of directory listings.

### Executing Tests

- **Run All Unit Tests** (asset-independent):
  ```sh
  pnpm run test
  ```
  This command passes in a fresh clone without `pipeline/input/`. CI runs the same suite through
  `pnpm run test:coverage`.
- **Measure coverage** (opt-in; the same suite plus v8 coverage):
  ```sh
  pnpm run test:coverage
  ```
  Coverage covers `src/lib/engine/`, `src/lib/stores/`, & `pipeline/src/`. It's reported, not gated:
  the terminal prints a summary, `coverage/index.html` has per-line detail, and CI writes a per-area
  table with the least-covered files to the test job's summary. Plain `pnpm run test` and
  single-file runs don't measure coverage, so they cost nothing extra.
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

- **Run application tests only** (`src/`: the `app`, `cold`, & `client` projects):
  ```sh
  pnpm run test:app
  ```
  `pnpm run test:client` runs only the `client` project.
- **Run data pipeline tests only** (`pipeline/`):
  ```sh
  pnpm run test:pipeline
  ```
  This command is also asset-independent.
- **Run one file** from any project:
  ```sh
  pnpm exec vitest run path/to/file.test.ts
  ```

### Test projects

`vite.config.ts` splits Vitest into projects by what each test needs to run. Vitest assigns a file
to its project, so a file path alone selects the right environment. Select a whole project with
`pnpm exec vitest run --project=<name>`.

| Project    | Files                                                     | Environment & setup                                            |
| ---------- | --------------------------------------------------------- | -------------------------------------------------------------- |
| `app`      | `src/**/*.test.ts`                                        | Node, SvelteKit stand-ins & preloaded names, isolated per file |
| `cold`     | `src/**/*.cold.test.ts`                                   | Node, isolated per file, no names preload                      |
| `client`   | `src/**/*.client.test.ts`                                 | happy-dom & Testing Library                                    |
| `pipeline` | `pipeline/**/*.test.ts`                                   | Plain Node without the app's Vite plugins                      |
| `node`     | `*.test.ts` under `eslint-rules/`, `scripts/`, & `tests/` | Plain Node without the app's Vite plugins                      |
| `assets`   | `**/*.assets.test.ts`                                     | Installed game assets; local only, excluded from `test`        |

Every project isolates files and restores spies & stubbed globals before each test. Set up spies and
`vi.stubGlobal()` in the test or `beforeEach`, rather than relying on suite-level stubs. A new tier
gets its own project rather than another entry in an exclude list. Tests that need an unloaded names
cache use the `*.cold.test.ts` convention and run in `cold` without preloads; ordinary `vi.mock()`
tests remain in `app`. `tests/vitest-projects.test.ts` fails when a tracked test file belongs to no
project or to more than one.

### Local real-data verification

Changes to the pipeline parser, evaluator, extractors, or shared tracker-data contract require two
additional local checks against the installed game assets:

```sh
pnpm run test:pipeline:assets
pnpm run pipeline:assets -- --version=1.0.5
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

| Command                  | Description & Purpose                                                            | Scope                |
| ------------------------ | -------------------------------------------------------------------------------- | -------------------- |
| `pnpm run lint`          | Checks oxfmt formatting, oxlint, ESLint (Svelte templates), and Stylelint        | All files            |
| `pnpm run check:i18n`    | Verifies every locale file matches `en.json`'s key shape                         | `messages/`          |
| `pnpm run check`         | Synchronizes SvelteKit types and runs `svelte-check` plus the pipeline `tsc`     | `src/` & `pipeline/` |
| `pnpm run test:coverage` | Executes the complete Vitest suite and summarizes coverage (not gated)           | Unit & logic tests   |
| `pnpm run build`         | Compiles SvelteKit app and verifies Cloudflare adapter                           | Build validation     |
| `pnpm run check:routes`  | Proves every built static asset bypasses Cloudflare Functions via `_routes.json` | Build validation     |

`.github/workflows/ci.yml` also runs the accessibility and PWA Playwright suites against the build
job's output when `src/`, `static/`, `tests/`, or their configs change; see
[accessibility testing](accessibility-testing.md) and [PWA verification](pwa-verification.md). Its
"CI passed" job fails when any other job fails and passes when the browser jobs were skipped, so it
is the one check to require for merging.

### Linting & formatting

`pnpm run lint` runs four tools, each covering what the others can't:

| Tool      | Config                | Covers                                                                                                              |
| --------- | --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| oxfmt     | `.oxfmtrc.json`       | Formatting, import-statement sorting, & Tailwind class sorting, in every file type                                  |
| oxlint    | `.oxlintrc.json`      | Every script, including `.svelte` `<script>` blocks; type-aware rules through tsgolint                              |
| ESLint    | `eslint.config.js`    | `.svelte` & `.svelte.{js,ts}` only: eslint-plugin-svelte, template-aware unused variables, & `no-hardcoded-ui-text` |
| Stylelint | `stylelint.config.js` | Scoped CSS; see [styling](styling.md#lint-rules)                                                                    |

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
there for oxlint's rules.

### Full local matrix

`pnpm run verify` runs CI's non-browser matrix locally (`lint`, `check`, `check:i18n`, `test`,
`build`, `check:routes`) with compact output, stopping on the first failure. It is read-only: it
runs `lint`, not `lint:fix`, so run `pnpm run lint:fix` beforehand. Opt-in flags add the local-only
steps: `pnpm run verify -- --assets` adds `test:pipeline:assets`, `--browser` adds
`test:accessibility` & `test:pwa`, and `--all` adds both. Run it once, when commit-ready, only for
the exceptions in [AGENTS.md §7](../AGENTS.md#7-verification). If a step fails, fix the issue and
rerun only that step, then rerun `pnpm run verify` once.

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

### Preview from a subagent worktree

The Claude Code desktop app resolves `.claude/launch.json` against the session's primary working
directory, which subagents share. A subagent spawned with `isolation: "worktree"` that calls
`preview_start` with `name: "dev"` therefore serves the orchestrator's checkout, not its own (#581).
Subagents start their own dev server instead:

1. From the subagent's worktree, start Vite in the background on a port no other session uses
   (`pnpm exec vite dev --port 5180 --strictPort`; pick another port if it's taken).
2. Open it with `preview_start` and a `url` (`http://localhost:5180`), never a `name`.
3. Before checking anything, unregister stale service workers. A worker another dev or preview
   server registered on the same origin can serve its own cached pages, including the offline
   fallback. Run this in the page with `javascript_tool`, then reload:

   ```js
   for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
   ```

4. Stop the server when the check is done.

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
  pnpm run pipeline:assets -- --version=1.0.5
  ```
  Review `git diff src/lib/data/tracker-data.json` to verify schema and data accuracy.

### Git Hook Permission or Execution Failures in Worktrees

- **Symptom**: Pre-commit hooks fail or block commits inside isolated worktree environments.
- **Recovery**: Bypass hooks if necessary (`git commit --no-verify`), provided you have directly run
  `pnpm run lint:fix` and the focused checks from §5; CI still runs the full matrix on the PR.

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
