# Agent Documentation Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Harvest Helper documentation and developer ergonomics so agents can work safely
with minimal context overload, establishing strict task workflows, updating verification commands,
maintaining worktree rules, and logging audit issues.

**Architecture:** Universal mandatory instructions reside in `AGENTS.md`. Deep specialized
architectural and workflow documentation is factored out into `docs/development-workflow.md` and
`docs/app-architecture.md`. `README.md` and `CONTRIBUTING.md` serve as human-facing summaries
pointing to canonical docs. Explicit pnpm test scripts (`test`, `test:app`, `test:pipeline`) provide
fast, targeted verification.

**Tech Stack:** Node >=26, pnpm, SvelteKit 2, Svelte 5, Vitest, TypeScript (strict).

## Global Constraints

- **Strict TypeScript & Formatting:** Follow project Prettier (double quotes, 100 char width,
  semicolons) and perfectionist sorting.
- **Workflow Safety:** Explicit verification steps (`pnpm run lint:fix`, `pnpm run check`,
  `pnpm run test`, `pnpm run build`) must be documented and executed.
- **Git Hook Realism:** Git hooks are conveniences, not substitutes for agent execution of commands.
- **Asset Boundaries:** Treat `pipeline/input` as read-only. `pipeline/output` is unshared, ignored,
  and excluded from `.worktreeinclude`.
- **Command Policy:** Use `pnpm` exclusively (no `npm`/`npx`/`bunx`).

---

### Task 1: Add Vitest Scripts to `package.json` & Adjust `.worktreeinclude`

**Files:**

- Modify: `package.json:6-16`
- Modify: `.worktreeinclude:1-5`
- Test: Run script verification commands

**Interfaces:**

- Consumes: Existing npm scripts in `package.json`
- Produces: `test`, `test:app`, `test:pipeline` scripts for Vitest runs

- [ ] **Step 1: Update `package.json` with test scripts**

Modify `package.json` to add the vitest scripts:

```json
    "test": "vitest run",
    "test:app": "vitest run src/",
    "test:pipeline": "vitest run pipeline/",
```

- [ ] **Step 2: Update `.worktreeinclude` to exclude `pipeline/output/`**

Edit `.worktreeinclude` to remove `pipeline/output/`:

```text
pipeline/input/
.env
.env.*
```

- [ ] **Step 3: Verify new scripts execute correctly**

Run: `pnpm run test:pipeline` Expected: Passes or executes vitest for pipeline tests appropriately.

- [ ] **Step 4: Commit changes**

```bash
git add package.json .worktreeinclude
git commit -m "build: add explicit test scripts and isolate worktree output"
```

---

### Task 2: Create `docs/development-workflow.md`

**Files:**

- Create: `docs/development-workflow.md`

**Interfaces:**

- Consumes: Specification guidelines from
  `docs/superpowers/specs/2026-08-12-agent-documentation-audit-design.md`
- Produces: Detailed development workflow reference for local setup, worktree mechanics, test-first
  development, Superpowers usage, and verification.

- [ ] **Step 1: Write `docs/development-workflow.md`**

Create `docs/development-workflow.md` covering:

- Local setup requirements (Node >=26, pnpm, frozen lockfile).
- Git worktree mechanics (creating worktrees in `.worktrees/<issue-number>-<short-description>`,
  symbolic linking of `pipeline/input/`, isolation of `pipeline/output/`).
- Superpowers workflow (invoking skills before exploration/implementation, spec/plan approval gates
  before touching code).
- Verification command matrix (`pnpm run lint:fix`, `pnpm run check`, `pnpm run test`,
  `pnpm run build`).
- Troubleshooting and common recovery steps.

- [ ] **Step 2: Verify linting & formatting**

Run: `pnpm run lint` Expected: Prettier checks pass for markdown file.

- [ ] **Step 3: Commit `docs/development-workflow.md`**

```bash
git add docs/development-workflow.md
git commit -m "docs: add detailed development workflow documentation"
```

---

### Task 3: Create `docs/app-architecture.md`

**Files:**

- Create: `docs/app-architecture.md`

**Interfaces:**

- Consumes: Architecture details from design spec
- Produces: Detailed architectural reference for data pipeline artifacts, reactive state,
  persistence, save import, device transfer, and UI component composition.

- [ ] **Step 1: Write `docs/app-architecture.md`**

Create `docs/app-architecture.md` covering:

- Generated data contracts (`src/lib/data/tracker-data.json`, `src/lib/types/tracker-data.ts`).
- Domain logic purity (`src/lib/engine/`) vs reactive state (`src/lib/stores/user-state.svelte.ts`).
- Serialization, localStorage persistence, save-file import (`.sav` parsing), backup restore vs
  additive transfer.
- Route composition (pages as layout compositors, page-colocated components, vendored
  `src/lib/components/ui/`).
- Separation of progress calculation vs UI row visibility/filtering.

- [ ] **Step 2: Verify linting & formatting**

Run: `pnpm run lint` Expected: Prettier checks pass for markdown file.

- [ ] **Step 3: Commit `docs/app-architecture.md`**

```bash
git add docs/app-architecture.md
git commit -m "docs: add comprehensive application architecture reference"
```

---

### Task 4: Revise Universal Operating Rules in `AGENTS.md`

**Files:**

- Modify: `AGENTS.md:1-115`

**Interfaces:**

- Consumes: Universal rules from design spec and references to new doc files
  (`docs/development-workflow.md`, `docs/app-architecture.md`).
- Produces: Concise, mandatory universal instructions for agents.

- [ ] **Step 1: Rewrite `AGENTS.md`**

Update `AGENTS.md` to:

- Clearly define mandatory worktree rules and `.worktreeinclude` handling (symbolic links for
  read-only `pipeline/input/`, no sharing of writable output/caches).
- Detail the 10-step universal task lifecycle (reading issues/comments, superpowers invocation,
  baseline verification, test-first development, verification matrix, PR creation).
- Update command references to use `pnpm` exclusively and list `test`, `test:app`, `test:pipeline`.
- State explicitly that Git hooks are a developer convenience and do not satisfy agent verification
  requirements.
- Document architectural boundary rules (no hand-editing generated JSON, pure `src/lib/engine/`,
  vendored UI rules).
- Link out to `docs/development-workflow.md`, `docs/app-architecture.md`, `pipeline/README.md`, and
  `docs/save-file-format.md`.

- [ ] **Step 2: Verify formatting and links**

Run: `pnpm run lint` Expected: Pass clean.

- [ ] **Step 3: Commit `AGENTS.md` updates**

```bash
git add AGENTS.md
git commit -m "docs: streamline AGENTS.md with universal operating rules and deep doc links"
```

---

### Task 5: Align `CONTRIBUTING.md` and `README.md` with Canonical Docs

**Files:**

- Modify: `CONTRIBUTING.md`
- Modify: `README.md`

**Interfaces:**

- Consumes: Updated commands and documentation links
- Produces: Clean human-facing developer instructions linking to deep docs without redundancy.

- [ ] **Step 1: Update `CONTRIBUTING.md`**

Update command table with `pnpm run test`, `pnpm run test:app`, `pnpm run test:pipeline` and add
links to `docs/development-workflow.md` and `docs/app-architecture.md`. Ensure all `npx`/`bunx`
references are removed.

- [ ] **Step 2: Update `README.md`**

Review `README.md` for outdated commands or broken documentation links and align references with the
new documentation structure.

- [ ] **Step 3: Verify formatting and links**

Run: `pnpm run lint` Expected: Pass clean.

- [ ] **Step 4: Commit changes**

```bash
git add CONTRIBUTING.md README.md
git commit -m "docs: align CONTRIBUTING.md and README.md with updated documentation structure"
```

---

### Task 6: Audit and Document Discovered GitHub Issues

**Files:**

- Create/Modify: GitHub issue references or audit log in PR notes (documenting findings like recipe
  totals mismatch, PR CI absence, Husky worktree determinism, invalid backup feedback, PWA
  verification, and pipeline schema precision).

**Interfaces:**

- Consumes: Audit findings detailed in section "Issue audit" of
  `docs/superpowers/specs/2026-08-12-agent-documentation-audit-design.md`.
- Produces: Summary of findings ready for issue filing / PR description.

- [ ] **Step 1: Check existing issues using `gh issue list` / `gh issue view`**

Run `gh issue list` to verify existing issues (such as #77) and draft formal issue details for
deferred non-functional and maintainability findings.

- [ ] **Step 2: Verify full repository validation suite**

Run: `pnpm run lint:fix && pnpm run check && pnpm run test && pnpm run build` Expected: All commands
pass cleanly.

- [ ] **Step 3: Final verification commit (if any minor cleanups needed)**

```bash
git status
```

Ensure working tree is clean.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-13-agent-documentation-audit.md`.

Two execution options:

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks,
   fast iteration.
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with
   checkpoints.

Which approach?
