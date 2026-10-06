# AGENTS.md — Mistria Field Guide

> Universal operating rules for agents. For detailed workflow, architecture, and verification
> guidance, see [docs/development-workflow.md](docs/development-workflow.md),
> [docs/app-architecture.md](docs/app-architecture.md), [pipeline/README.md](pipeline/README.md),
> [docs/save-file-format.md](docs/save-file-format.md),
> [docs/mistria-wiki-api.md](docs/mistria-wiki-api.md),
> [docs/localization.md](docs/localization.md), [docs/styling.md](docs/styling.md), and
> [docs/cloud-agent-environments.md](docs/cloud-agent-environments.md).

## 1. Worktree isolation

Every agent must operate inside an isolated Git worktree when **modifying tracked files**. Shared
working trees cause edit collisions, dirty-state confusion, & branch-switch destruction. Agents must
not decide to skip this on their own — only the user can grant an exception.

**Worktree required** for any task that creates, edits, or deletes tracked files (code, config,
documentation, tests, CI, licenses, gitignore).

**Worktree not required** for read-only work: audits, log analysis, issue triage, review of existing
code, scratchpad-only output. These may run in the main checkout.

**Cloud-session exception:** An agent running in a fresh, platform-managed ephemeral container on a
session-assigned branch works directly in that checkout. It must not create a nested worktree or
replace the assigned branch. This exception applies only when the platform guarantees isolation for
that session; local and shared checkouts still require worktrees.

Harness-created worktrees and branches (such as Claude Code’s `.claude/worktrees/` with
`claude/issue-<number>-<suffix>` branches, or Codex’s `codex/…` branches) are equally acceptable.

Create and set up a worktree with one command:

```sh
pnpm run worktree:new <issue-number>-<short-description>
```

This creates `.worktrees/<slug>` on a matching branch (`<issue-number>-<short-description>`),
symlinks the `.worktreeinclude` entries in from the main checkout, and runs
`pnpm install --frozen-lockfile` and `pnpm run prepare`. It never copies dependencies, caches, build
artifacts, or other writable generated directories. See
[docs/development-workflow.md §2](docs/development-workflow.md#2-git-worktree-mechanics--workspace-isolation)
for the manual steps and troubleshooting. Inside a harness-created worktree, run
`pnpm run worktree:setup` for the same symlink & install steps.

**Subagent worktrees:** an orchestrator gives each editing subagent a worktree its harness lets that
subagent edit. In Claude Code, the session's edit guard refuses Write/Edit outside the session's own
worktree, including `.worktrees/`, so spawn editing subagents with the Agent tool's
`isolation: "worktree"` and have each run `pnpm run worktree:setup` first.

**Refused edits:** if the harness refuses a file write or edit, stop and report it. Never route
around the refusal with shell writes (heredocs, `sed -i`, `perl -i`, scripts); the guard exists to
keep agents out of the shared checkout, and a shell write bypasses it silently.

The installed game assets are a massive `assets.zip` archive. Do not unpack the full archive without
the user's explicit approval. The pipeline should read the archive directly or materialize only the
small required subtrees.

## 2. Git configuration

The repo remote uses HTTPS (not SSH) and authenticates via `gh auth`. Do not switch the remote back
to SSH. Pushing & signing must work without interactive prompts.

- **Maintainer machine (local):** commit signing uses a local SSH key with
  `gpg.ssh.program = ssh-keygen`, configured so signing never opens a 1Password prompt.
- **Cloud & other sandboxes:** the maintainer's signing key is absent. Unsigned agent commits are
  acceptable there; the platform's own commit identity may sign instead. Never copy a private key
  into a sandbox to make signing work.

### Agent attribution

Agent attribution is mandatory for agent-authored Git and GitHub content:

- Keep the repository owner's configured identity as the commit author. Add the agent's standard
  `Co-Authored-By` trailer to every commit the agent materially authored. Use a stable product-level
  identity rather than changing the trailer with each model version; for example,
  `Co-Authored-By: Claude Code <noreply@anthropic.com>` or
  `Co-Authored-By: Codex <codex@openai.com>`.
- Add a final `Agent: <agent-id>` line to every agent-authored issue or PR body. Use `claude-code`
  for Claude Code, `codex` for Codex, and a stable lowercase product slug for another agent.
- Add exactly one matching `agent:*` label to every agent-authored PR and every issue the agent
  claims for implementation. Authorship is not ownership: when an agent files an issue, include the
  `Agent:` attribution line but do not apply an `agent:*` label unless the agent separately claims
  the issue under §3. The established labels remain `agent: claude`, `agent: codex`,
  `agent: antigravity`, `agent: kilo`, `agent: copilot`, and `agent: lm studio`; do not create a
  parallel `agent/...` label family.
- End every substantive agent-authored GitHub comment with the same `Agent: <agent-id>` line. This
  remains required when an issue or PR already has an agent label because multiple agents may
  participate in one thread.
- For multiline GitHub CLI issue or PR bodies, pass a file or stdin with literal line breaks (for
  example, `gh issue edit --body-file -`). Do not embed escaped `\\n` sequences in `--body`; GitHub
  renders them literally. Re-read the published body after creating or editing it.
- Checks: a `commit-msg` hook rejects drifted trailers locally, and the "Attribution" workflow
  checks a PR's own commits (final trailer block only), its final `Agent:` line, & its single
  `agent:*` label (human-only PRs pass). The workflow blocks a merge only once the main ruleset
  lists "Attribution" as a required check. A harness reminder may inject model-versioned text;
  correct it before committing.
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
6. **Baseline** — install dependencies (Node 24 per `.node-version`;
   `pnpm install --frozen-lockfile`) and verify a clean baseline.
7. **Understand contracts** — read the affected subsystem, its boundaries, and existing tests before
   editing.
8. **Test first** — add or update tests for behavioral changes, preferably before implementation.
   Run focused tests during development (see §7).
9. **Verify** — run `pnpm run lint:fix` before committing; CI runs the full matrix (see §7).
10. **Deliver** — commit with the required co-author trailer, push, and open an attributed PR that
    references the issue (`Closes #N`). Apply the matching `agent:*` label to the PR. Keep the
    active-work labels through PR review. On handoff, replace the active `agent:*` labels. When work
    closes, is abandoned, or stops pending a decision or dependency, remove both active-work labels
    and set the appropriate remaining status. Production builds derive their application version
    from deterministic Git commit metadata. Treat `package.json`'s version and Git version tags as
    intentional product-release metadata: do not change or create them unless the task explicitly
    cuts a release, and ask the user to approve the release version first.
11. **Monitor CI** — after opening the PR, watch its checks so CI failures are caught and fixed
    without requiring the user to relay status. Use whatever the harness offers for PR monitoring
    (for example, the Claude Code desktop app's `ccd_pr` `bind_pr` & `set_monitor` tools), or check
    `gh pr checks` periodically.

### GitHub evidence & prototypes

- Attach screenshots with GitHub CLI's `--attach` flag. Include useful prototype code in a collapsed
  `<details>` element. See the
  [development workflow](docs/development-workflow.md#attach-visual-evidence--prototype-code) for
  the exact syntax and examples.

> Git pre-commit hooks are developer conveniences, not verification evidence. Agents must run the
> documented commands directly and verify clean exit status before committing.

## 4. Commands

Use **pnpm** exclusively. Do **not** use `npm`, `npx`, `yarn`, or `bun`. The one exception is
Wrangler, which is only a transitive dependency: run one-off commands as `pnpx wrangler <command>`.
On a pnpm store that hasn't approved Wrangler's native dependencies yet (`esbuild`, `workerd`), that
fails non-interactively with `ERR_PNPM_IGNORED_BUILDS`; add
`--allow-build=esbuild --allow-build=workerd` to the `pnpx` invocation rather than running the
interactive `pnpm approve-builds` (unsupported in an agent shell).
`scripts/sprites/upload-sprites.sh` and `scripts/locale-fonts/upload-locale-fonts.sh` already pass
it. Wrangler may need access to Cloudflare's API and to its stored credentials (on macOS, under
`~/Library/Preferences/.wrangler/`); never read or expose the stored OAuth token.

| Command                       | Purpose                                     |
| ----------------------------- | ------------------------------------------- |
| `pnpm run dev`                | Dev server                                  |
| `pnpm run preview`            | Preview the production build locally        |
| `pnpm run build`              | Production build (Cloudflare Pages)         |
| `pnpm run check`              | SvelteKit type checking                     |
| `pnpm run check:i18n`         | Verify locale files match `en.json`'s keys  |
| `pnpm run check:routes`       | Verify built static assets bypass Functions |
| `pnpm run lint`               | oxfmt + oxlint + ESLint + Stylelint check   |
| `pnpm run lint:fix`           | Auto-fix formatting & lint                  |
| `pnpm run test`               | Complete Vitest suite (asset-independent)   |
| `pnpm run test:changed`       | Vitest tests affected by branch changes     |
| `pnpm run test:app`           | App tests (`src/`)                          |
| `pnpm run test:pipeline`      | Pipeline tests (`pipeline/`)                |
| `pnpm run test:accessibility` | Browser accessibility matrix (Playwright)   |
| `pnpm run verify`             | Full CI matrix locally (see §7 exceptions)  |
| `pnpm run pipeline -- <path>` | Regenerate `tracker-data.json` from assets  |

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
- Both guarded paths above are enforced: a Claude Code `PreToolUse` hook
  (`scripts/guard-generated-paths.ts`) refuses agent edits, CODEOWNERS routes them to the owner, and
  the "Guarded paths" workflow fails a PR that changes them without the `shadcn-update` or
  `generated-data` label. Codex has no equivalent hook; its rules only gate shell commands.
- `.claude/settings.json` and `.codex/rules/default.rules` allow the same `pnpm` scripts;
  `tests/agent-permissions.test.ts` fails when a `package.json` script is in neither the allowlists
  nor its explicit exclusion list.
- Category pages are layout compositors. Shared or stateful concerns belong in focused components.
- **Componentize along logical lines.** Break complex components into sub-components that each own
  one concern (a checkbox, a sprite slot, a source card), even when they have only one call site.
  The goal is reasoning clarity, not reuse.
- **`docs/superpowers/`** (`plans/`, `specs/`, & `notes/`) holds historical artifacts, dated records
  of what was planned, designed, or observed at the time. The root `.ignore` hides it from
  ripgrep-based search; read a file there only when a task names it. Do not edit them to reflect
  later renames, refactors, or reversals — a later change (e.g. a rename of `npcs` to `villagers`)
  should not touch their prose even though it makes older identifiers there stale. Update current
  reference docs (`docs/*.md` outside `superpowers/`) instead.

## 6. Code style

- **TypeScript**: type-aware oxlint with every non-nursery category on (each disabled rule states
  why) + `strict: true` & `noImplicitReturns` tsconfigs. Use `type` imports
  (`consistent-type-imports`).
- **Formatting**: oxfmt — double quotes, no tabs, trailing commas, 100 char width, semicolons.
- **Linting**: oxlint for every script, ESLint only for Svelte templates. See
  [docs/development-workflow.md](docs/development-workflow.md#linting--formatting) for which tool
  owns which rule and how to suppress each.
- **Imports**: Auto-sorted by oxfmt — externals first, then `#lib`/`$app` internals, then relative.
  Import `src/lib` through the `#lib` subpath import (declared in `package.json`'s `imports`);
  SvelteKit 3 removed the `$lib` alias. Always write the file extension: `#lib` subpath imports
  don't resolve without one, and relative imports follow the same rule for consistency. Name a
  TypeScript module by its `.js` output (`./availability.js`, `#lib/utils.js`, `./store.svelte.js`)
  and every other file by its real extension (`.svelte`, `.json`, `.css`). SvelteKit's virtual
  `./$types` modules are the one exception. `vi.mock(...)` specifiers must match the import path
  exactly, so update them alongside the imports they mock.
- **Styling**: Tailwind utilities & scoped `<style>` blocks, both on the design tokens in
  `src/app.css`; Stylelint rejects color, type-size, shadow, & radius literals in scoped CSS. See
  [docs/styling.md](docs/styling.md).
- **Svelte**: Use `let` (not `const`) for `$props()` destructuring. Use runes (`$state`, `$derived`,
  `$effect`), not legacy stores.
- **Naming**: `camelCase` variables/functions, `PascalCase` types/components, `kebab-case` files.
  Branded IDs for type safety.
- **Tests**: Colocate as `foo.test.ts` beside `foo.ts`; no `__tests__/` directories. See
  [docs/development-workflow.md §4](docs/development-workflow.md#test-file-placement).
- **Rules**: `eqeqeq`, `prefer-const` (oxlint for scripts, `svelte/prefer-const` for Svelte files;
  `$props()` destructuring must use `let`, which is linted), `no-var`, `object-shorthand`,
  `prefer-template`, `curly` (multi-line).

## 7. Verification

Agents verify locally with focused checks; GitHub Actions runs the complete matrix on every pull
request. Running the full matrix locally by default wastes tokens, bloats context, and accelerates
compaction.

### Local (every change)

- Run only the test covering your change: `pnpm exec vitest run path/to/file.test.ts`.
- Run `pnpm run check` after a TypeScript or Svelte contract edit.
- Run `pnpm run lint:fix` before committing. Lint must produce zero errors and zero warnings; a
  warning that needs an `oxlint-disable`, `eslint-disable`, or `stylelint-disable` comment gets the
  narrowest possible disable with a justification.
- Documentation-only changes: `pnpm run lint:fix && pnpm run lint` only.

### CI (every pull request)

`ci.yml` runs `lint`, `check`, `check:i18n`, `test`, `build`, & `check:routes`, then the
accessibility and PWA suites against that build when `src/`, `static/`, `tests/`, or their tooling
change. Its "CI passed" job aggregates every result. A PR merges only when it passes; fix CI
failures on the branch rather than merging around them (see §3 step 11).

### Full local matrix (exceptions)

`pnpm run verify` is read-only & runs CI's non-browser matrix (`lint`, `check`, `check:i18n`,
`test`, `build`, `check:routes`); run `pnpm run lint:fix` first. Add `-- --assets` for
`test:pipeline:assets`, `--browser` for the Playwright suites, or `--all` for both. Run it once,
when commit-ready, only when:

- The change regenerates `tracker-data.json` or touches the pipeline parser, evaluator, extractors,
  or shared tracker contract. CI has no game assets, so `pnpm run test:pipeline:assets` and the
  pipeline run are local-only checks; see
  [docs/development-workflow.md §4](docs/development-workflow.md#4-test-first-development--test-matrix).
- The change touches a high-risk surface listed in §9.
- A CI failure cannot be reproduced with a focused test.
- The change edits a check CI does not run for that change (release scripts, browser suites outside
  their trigger paths).

If a step fails, fix it and rerun only that step, then rerun `pnpm run verify` once. After it
passes, don't rerun it unless you make further code changes. Pipe verbose commands through `tail`
(e.g. `pnpm run lint 2>&1 | tail -30`); for CI failures, prefer `gh run view <id> --log-failed`
once.

> Git pre-commit hooks are developer conveniences, not verification evidence. Run the documented
> commands directly and confirm clean exit status.

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

### Review trail

Reviews must leave a durable record on GitHub, not only in an agent session, so a later agent can
aggregate findings across pull requests.

- An agent asked to review posts its findings as a PR review (`gh pr review --comment`) or, when
  there is no PR, an issue comment. Give each finding a severity, the finding, its impact, and a
  suggested fix. End the comment with the `Agent:` line from §2.
- Reviewing does not include fixing. Address findings only when the user asks.
- When asked to address findings, reply in the same thread with the resolution for each one,
  including "won't fix" with a reason. The resolution matters as much as the finding: a single
  review opinion may be mistaken or superseded.
- Documentation guidance follows the trail
  `finding → resolution → repeated pattern → narrowly scoped guidance`. Add a rule only for
  recurring evidence or one severe incident with a clear preventive rule, place it in the narrowest
  durable document, and keep this file concise rather than a catalogue of past bugs.

## 10. Session lifecycle

### Budget

- **One concern per session.** One issue, one PR-sized deliverable.
- **Stop at the first context compaction**, a harness usage or context warning, or the end of the
  agent's usage window, whichever comes first. Agents can't count their own requests, so none of
  these triggers is a request count.
- When approaching limits, write a handoff note to the worktree or issue, then stop. A fresh session
  reading the issue and branch is 50–100x cheaper than re-tokenizing a cold conversation.

### Recurring friction

When you work around a tooling, environment, or repository bug (a failing command, a flaky setup
step, stale docs), search open issues for it first. Add your evidence to an existing issue, or file
one with the symptom, the workaround, and a root-cause guess. Name the workaround in your final
report either way. Workarounds that each agent rediscovers cost more than one fix.

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

Route to the cheapest capable model once, at the start, and don't reevaluate mid-session unless you
discover unexpected complexity. The tiers, per-agent model names, & switching commands live only in
[DELEGATION.md](.agents/DELEGATION.md); this repo does not pin a model in harness settings.
