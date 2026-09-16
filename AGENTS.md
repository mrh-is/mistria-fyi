# AGENTS.md — Mistria Field Guide

> Universal operating rules for agents. For detailed workflow, architecture, and verification
> guidance, see [docs/development-workflow.md](docs/development-workflow.md),
> [docs/app-architecture.md](docs/app-architecture.md), [pipeline/README.md](pipeline/README.md),
> [docs/save-file-format.md](docs/save-file-format.md), and
> [docs/mistria-wiki-api.md](docs/mistria-wiki-api.md).

## 1. Worktree isolation

Every agent must operate inside an isolated Git worktree when **modifying tracked files**. Shared
working trees cause edit collisions, dirty-state confusion, & branch-switch destruction. Agents must
not decide to skip this on their own — only the user can grant an exception.

**Worktree required** for any task that creates, edits, or deletes tracked files (code, config,
documentation, tests, CI, licenses, gitignore).

**Worktree not required** for read-only work: audits, log analysis, issue triage, review of existing
code, scratchpad-only output. These may run in the main checkout.

Create and set up a worktree with one command:

```sh
pnpm run worktree:new <issue-number>-<short-description>
```

This creates `.worktrees/<slug>` on a matching branch, symlinks the `.worktreeinclude` entries in
from the main checkout, and runs `pnpm install --frozen-lockfile` and `pnpm run prepare`. It never
copies dependencies, caches, build artifacts, or other writable generated directories. See
[docs/development-workflow.md §2](docs/development-workflow.md#2-git-worktree-mechanics--workspace-isolation)
for the manual steps and troubleshooting.

## 2. Git configuration

The repo remote uses HTTPS (not SSH) and authenticates via `gh auth`. Commit signing uses a local
SSH key with `gpg.ssh.program = ssh-keygen`. Both are configured to work non-interactively so agents
can push and sign commits without triggering 1Password or other interactive prompts. Do not switch
the remote back to SSH.

### Agent attribution

Agent attribution is mandatory for agent-authored Git and GitHub content:

- Keep the repository owner's configured identity as the commit author. Add the agent's standard
  `Co-Authored-By` trailer to every commit the agent materially authored. Use a stable product-level
  identity rather than changing the trailer with each model version; for example,
  `Co-Authored-By: Claude Code <noreply@anthropic.com>` or
  `Co-Authored-By: Codex <codex@openai.com>`.
- Add a final `Agent: <agent-id>` line to every agent-authored issue or PR body. Use `claude-code`
  for Claude Code, `codex` for Codex, and a stable lowercase product slug for another agent.
- Add exactly one matching `agent:*` label to every agent-authored issue or PR. The established
  labels remain `agent: claude`, `agent: codex`, `agent: antigravity`, `agent: kilo`,
  `agent: copilot`, and `agent: lm studio`; do not create a parallel `agent/...` label family.
- End every substantive agent-authored GitHub comment with the same `Agent: <agent-id>` line. This
  remains required when an issue or PR already has an agent label because multiple agents may
  participate in one thread.
- Preserve existing attribution during edits and handoffs. The active `agent:*` label identifies the
  current top-level owner; trailers and `Agent:` lines identify who authored each artifact.

## 3. Task lifecycle

Follow this sequence for every task:

1. **Read the issue & comments** — use `gh issue view <number> --json title,body,labels,comments`.
   The `--comments` flag produces empty output when there are no comments; `--json` is reliable in
   all cases. Do not start issues labeled `status: blocked` or `status: needs decision`. If an issue
   has `status: in progress` or an `agent:*` label, coordinate with its current owner rather than
   starting duplicate work.
2. **Ask questions before starting.** After reading the issue but before any implementation, surface
   uncertainties. If the task has ambiguous scope, multiple valid approaches, or unclear acceptance
   criteria, ask the user. "I'm about to do X; any concerns?" is cheap. A wrong assumption that
   compounds across 50 tool calls is expensive.
3. **Scope the change** — identify the affected subsystem, acceptance criteria, & deliverables. For
   nontrivial features, write a short acceptance checklist (3–7 items describing the states the
   finished feature must satisfy). Get user approval on the checklist before implementing.
4. **Claim the issue** — replace its current `status:*` label with `status: in progress` and add
   exactly one `agent:*` label identifying the top-level orchestrator. Subagents use their
   orchestrator's identity.
5. **Worktree** — create an isolated worktree and branch **immediately** when starting work on an
   issue (see §1 for when worktrees are required). The worktree is the workspace for the entire
   task. Only skip if the user explicitly directs work in the current checkout.
6. **Baseline** — install dependencies (`Node >=26`, `pnpm install --frozen-lockfile`) and verify a
   clean baseline.
7. **Understand contracts** — read the affected subsystem, its boundaries, and existing tests before
   editing.
8. **Test first** — add or update tests for behavioral changes, preferably before implementation.
   Run focused tests during development (see §7).
9. **Verify** — run `pnpm run verify` once when commit-ready (see §7).
10. **Deliver** — commit with the required co-author trailer, push, and open an attributed PR that
    references the issue (`Closes #N`). Apply the matching `agent:*` label to the PR. Keep the
    active-work labels through PR review. On handoff, replace the active `agent:*` labels. When work
    closes, is abandoned, or stops pending a decision or dependency, remove both active-work labels
    and set the appropriate remaining status.
11. **Monitor CI** — after opening the PR, bind it and enable monitoring so CI failures are caught
    and fixed without requiring the user to relay status. Use `ccd_pr bind_pr` and `set_monitor` in
    Claude Code, or check `gh pr checks` periodically in other agents.

### GitHub evidence & prototypes

- Attach screenshots with GitHub CLI's `--attach` flag. Include useful prototype code in a collapsed
  `<details>` element. See the
  [development workflow](docs/development-workflow.md#attach-visual-evidence--prototype-code) for
  the exact syntax and examples.

> Git pre-commit hooks are developer conveniences, not verification evidence. Agents must run the
> documented commands directly and verify clean exit status before committing.

## 4. Commands

Use **pnpm** exclusively. Do **not** use `npm`, `npx`, `yarn`, or `bun`.

| Command                       | Purpose                                    |
| ----------------------------- | ------------------------------------------ |
| `pnpm run dev`                | Dev server                                 |
| `pnpm run build`              | Production build (Cloudflare Pages)        |
| `pnpm run check`              | SvelteKit type checking                    |
| `pnpm run lint`               | Prettier + ESLint check                    |
| `pnpm run lint:fix`           | Auto-fix formatting & lint                 |
| `pnpm run test`               | Complete Vitest suite (asset-independent)  |
| `pnpm run test:app`           | App tests (`src/`)                         |
| `pnpm run test:pipeline`      | Pipeline tests (`pipeline/`)               |
| `pnpm run verify`             | Full matrix with compact output (see §7)   |
| `pnpm run pipeline -- <path>` | Regenerate `tracker-data.json` from assets |

## 5. Architecture boundaries

These rules prevent accidental damage to generated or vendored code:

- **`src/lib/data/tracker-data.json`** is generated by the pipeline. Never hand-edit.
- **`src/lib/types/tracker-data.ts`** is the shared data contract between pipeline & app.
- **`src/lib/engine/`** contains pure domain logic. Side effects belong at store or component
  boundaries.
- **`src/lib/stores/user-state.svelte.ts`** owns mutable progress & localStorage persistence.
- Save import merges progress additively. Backup restore replaces the serialized state. These flows
  are not interchangeable.
- Transfer encoding uses deterministic orderings derived from generated tracker data. Ordering &
  schema changes require compatibility tests & deliberate versioning.
- **`src/lib/components/ui/`** is vendored shadcn-svelte code. Do not manually edit.
- Category pages are layout compositors. Shared or stateful concerns belong in focused components.
- **Componentize along logical lines.** Break complex components into sub-components that each own
  one concern (a checkbox, a sprite slot, a source card), even when they have only one call site.
  The goal is reasoning clarity, not reuse.

## 6. Code style

- **TypeScript**: `strictTypeChecked` ESLint + `strict: true` tsconfig. Use `type` imports
  (`consistent-type-imports`).
- **Formatting**: Prettier — double quotes, no tabs, trailing commas, 100 char width, semicolons.
- **Imports**: Auto-sorted by `perfectionist/sort-imports` — externals first, then `$lib`/`$app`
  internals, then relative.
- **Svelte**: Use `let` (not `const`) for `$props()` destructuring. Use runes (`$state`, `$derived`,
  `$effect`), not legacy stores.
- **Naming**: `camelCase` variables/functions, `PascalCase` types/components, `kebab-case` files.
  Branded IDs for type safety.
- **Rules**: `eqeqeq`, `prefer-const` (except `.svelte`), `no-var`, `object-shorthand`,
  `prefer-template`, `curly` (multi-line).

## 7. Verification

This project has a history of agents running the full verification matrix dozens of times per
session. That pattern wastes tokens, bloats context, and accelerates compaction.

- **During development**: run only the specific test covering your change
  (`pnpm exec vitest run path/to/file.test.ts`), and `pnpm run check` after a TypeScript or Svelte
  contract edit. Don't run `pnpm run test`, `pnpm run lint`, `pnpm run build`, or `pnpm run verify`
  until you're commit-ready.
- **When commit-ready**: run `pnpm run verify` once. It chains lint:fix, lint, check, test, & build
  and stops on first failure. Lint must produce zero errors and zero warnings — a warning that needs
  an eslint-disable comment gets the narrowest possible disable with a justification. If a step
  fails, fix it and rerun only that step to confirm, then rerun `pnpm run verify` once more.
- **After the matrix passes**: don't rerun it unless you make further code changes.
- **Documentation-only changes**: `pnpm run lint:fix && pnpm run lint` only — no build, no tests.
- **Output handling**: pipe verbose commands through `tail` unless diagnosing a failure (e.g.
  `pnpm run lint 2>&1 | tail -30`). For CI failures, prefer `gh run view <id> --log-failed` once
  over repeated full-log downloads.

Full command reference and troubleshooting:
[docs/development-workflow.md §5](docs/development-workflow.md#5-verification-matrix).

## 8. Visual verification

When a task changes `.svelte` files, CSS, layout, or routes, verify visually before declaring done.
Screenshot accumulation is expensive; use a bounded checklist, not exploratory browsing.

### Required checklist

1. Start the dev server and navigate to every changed route.
2. Screenshot at desktop width (~1280) and mobile width (~390).
3. Exercise every changed interaction and one reversal or undo path.
4. Check light mode and dark mode.
5. Check relevant states: empty, loaded, error, disabled.
6. Check browser console for errors.

### Limits

- Cap at **10 screenshots** per PR. One per materially changed state, not one per interaction step.
- If a design reference exists (Figma file, existing page to match), screenshot both and compare.
- Record what was **not** visually verified in the PR description under a "Not verified" section.

### When to skip

Documentation-only changes, pipeline-only changes, and test-only changes do not need visual
verification. Changes to engine logic (`src/lib/engine/`) do not need visual verification unless
they affect rendered output.

## 9. Reviews

### Self-review (default)

For most PRs, review your own diff in a fresh context before requesting human review. A subagent
reading the diff cold catches mistakes the implementing context has normalized.

### Cross-agent adversarial review

Reserve independent cross-agent review for PRs that touch **high-risk surfaces**:

- Engine logic, state machines, or transfer encoding
- Data pipeline extractors or schema changes
- Store persistence or save/import/export flows
- Authentication, abuse controls, or security boundaries
- Changes spanning 5+ files with cross-cutting concerns

Use one review pass with a deterministic target (the merge-base diff). Do not run spec reviews, plan
reviews, and implementation reviews as separate passes. If the review finds high-severity issues
that require substantial changes, one re-review is justified; otherwise, fix and move on.

### Review prompts

Keep review prompts compact: the base commit, the changed files, the relevant invariants, and the
requested severity threshold. Do not restate the full plan or spec in the review prompt.

## 10. Session lifecycle

### Budget

- **One concern per session.** One issue, one PR-sized deliverable.
- **Stop at 100 model requests** or the **first context compaction**, whichever comes first.
- When approaching limits, write a handoff note to the worktree or issue, then stop. A fresh session
  reading the issue and branch is 50–100x cheaper than re-tokenizing a cold conversation.

### Handoffs

Do **not** paste handoff narratives. Give the new session:

- The branch name
- The issue number
- Optionally, a short note in the worktree (`HANDOFF.md`) if there's state that isn't captured in
  the issue or commit history

The new session reads `gh issue view`, `git log`, and `git diff` to reconstruct context.

### Reading files

- **Use `offset` & `limit`** on the Read tool whenever you need a specific function, type, or
  section. Reading 30 targeted lines instead of 500 saves 10–20K tokens per call.
- **Never read `src/lib/data/tracker-data.json`** — it is large generated data. Read the types in
  `tracker-data.ts` or the pipeline source instead.
- **Don't re-read files you already have in context.** If compression has dropped a file's contents,
  re-read only the section you need, not the entire file.

### Model routing

Evaluate task complexity before starting work. Use the cheapest model that can handle the task. See
[DELEGATION.md](.agents/DELEGATION.md) for the full routing table with model names per agent.

- **Simple** (single-file fix, lint issue, doc update, dependency bump): cheapest tier.
- **Medium** (bug fix, single-component feature, test additions): default tier.
- **Complex** (multi-file feature, architecture decision, difficult debugging): most capable tier.

Don't run an entire session at the most expensive model for a task the default could handle. The
routing decision happens once, at the start; don't reevaluate mid-session unless you discover
unexpected complexity.
