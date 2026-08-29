# Development Workflow Guide

> Detailed workflow reference for Harvest Helper development, including setup, worktree management,
> Superpowers skill execution, test-driven development, and verification.

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

---

## 2. Git Worktree Mechanics & Workspace Isolation

All agents must operate within an isolated Git worktree to prevent edit collisions, dirty-state
confusion, and branch switching interference across concurrent sessions.

### Worktree Location Rules

- Worktrees must be located under `.worktrees/<issue-number>-<short-description>` (or an agent's
  native managed worktree directory).
- Verify that `.worktrees/` is ignored before creating a new worktree:
  ```sh
  git check-ignore -q .worktrees/placeholder
  ```

### Worktree Creation & Setup

1. Create the worktree and branch:
   ```sh
   git worktree add .worktrees/<issue-number>-<short-description> -b <issue-number>-<short-description>
   ```
2. Enter the worktree directory and install locked dependencies:
   ```sh
   cd .worktrees/<issue-number>-<short-description>
   pnpm install --frozen-lockfile
   ```
3. Install Husky git hooks explicitly (required in environments where lifecycle scripts are disabled
   or skipped):
   ```sh
   pnpm run prepare
   ```

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

## 3. Superpowers & Skill Workflow

Harvest Helper enforces structured agent execution using Superpowers skills.

### Invoking Skills Before Action

- Invoke relevant skills (such as `brainstorming`, `writing-plans`, `executing-plans`,
  `systematic-debugging`, `test-driven-development`, `using-git-worktrees`, and
  `verification-before-completion`) **before** taking action or inspecting codebase files.

### Explicit Approval & Planning Gates

1. **Brainstorming & Design**: Explore intent, requirements, and subsystem impact before planning.
2. **Specification Gate**: Obtain explicit user approval on specifications before drafting
   implementation steps.
3. **Plan Gate**: Obtain explicit user approval on implementation plans before editing code.
4. **Commit Approved Artifacts**: Always commit approved specifications and plans to Git _before_
   starting the implementation work they describe.
5. **Execution Checkpoints**: Respect pause points and review checkpoints specified in execution
   plans.

---

## 4. Test-First Development & Test Matrix

Harvest Helper uses Vitest for unit testing across both application logic and data extraction
pipelines.

### Test-Driven Development (TDD) Lifecycle

1. **Red**: Write a failing unit test in `src/` or `pipeline/` that reproduces an issue or defines
   new behavior.
2. **Green**: Write the minimal implementation code necessary to pass the test.
3. **Refactor**: Clean up the implementation while maintaining passing tests.

### Executing Tests

- **Run All Unit Tests** (asset-independent):
  ```sh
  pnpm run test
  ```
  This command passes in a fresh clone without `pipeline/input/` and is the test command used by
  public CI.
- **Run Application Logic Tests Only** (`src/`):
  ```sh
  pnpm run test:app
  ```
- **Run Data Pipeline Tests Only** (`pipeline/`):
  ```sh
  pnpm run test:pipeline
  ```
  This command is also asset-independent.

### Local real-data verification

Changes to the pipeline parser, evaluator, extractors, or shared tracker-data contract require two
additional local checks against the installed game assets:

```sh
pnpm run test:pipeline:assets
pnpm run pipeline -- pipeline/input/assets
```

`test:pipeline:assets` validates the canonical v1.0.2 fixture and fails when its resolved assets
path is missing. Set `MISTRIA_ASSETS=/path/to/assets` to use another local assets root. The pipeline
command regenerates `src/lib/data/tracker-data.json`; review that diff before committing.

---

## 5. Verification Matrix

Before committing code or submitting a Pull Request, every change (including documentation-only
updates) must pass the core verification matrix.

| Command             | Description & Purpose                                   | Scope                     |
| ------------------- | ------------------------------------------------------- | ------------------------- |
| `pnpm run lint:fix` | Formats code with Prettier and auto-fixes ESLint errors | All files                 |
| `pnpm run lint`     | Checks formatting and ESLint compliance (CI equivalent) | All files                 |
| `pnpm run check`    | Synchronizes SvelteKit types and runs `svelte-check`    | `src/` & SvelteKit routes |
| `pnpm run test`     | Executes the complete Vitest test suite                 | Unit & logic tests        |
| `pnpm run build`    | Compiles SvelteKit app and verifies Cloudflare adapter  | Build validation          |

Pipeline parser, evaluator, extractor, & shared data-contract changes must additionally pass
`pnpm run test:pipeline:assets` and `pnpm run pipeline -- <path>` as described above. These local
commands are deliberately excluded from public CI because licensed game assets are not distributed
with the repository.

> [!IMPORTANT] Git pre-commit hooks are developer conveniences, not verification evidence. Agents
> must run the matrix commands directly in their shell and verify clean exit status before
> committing work.

---

## 6. Troubleshooting & Recovery Steps

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
  pnpm run pipeline -- pipeline/input/assets
  ```
  Review `git diff src/lib/data/tracker-data.json` to verify schema and data accuracy.

### Git Hook Permission or Execution Failures in Worktrees

- **Symptom**: Pre-commit hooks fail or block commits inside isolated worktree environments.
- **Recovery**: Bypass hooks if necessary (`git commit --no-verify`), provided you have directly run
  and passed `pnpm run lint:fix`, `pnpm run check`, `pnpm run test`, and `pnpm run build`.

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
