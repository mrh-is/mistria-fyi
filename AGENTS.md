# Mistria agent guide

These rules apply to every agent working in this repository. Claude Code reads this file through
`CLAUDE.md`, and Codex reads it as project instructions.

The links below point to longer guides. Before the work a link covers, read that guide’s relevant
heading, not the whole file; don’t load every guide at session start. User instructions & harness
restrictions take precedence. Personal agent workflows (model choice, delegation, review habits,
session limits) belong in each contributor’s user config.

## Focused verification

- Run the test that covers your change, not a full suite:
  `pnpm exec vitest run path/to/file.test.ts`.
  [Focused checks](docs/agent-verification.md#focused-checks) has the project flags that keep this
  fast.
- Add or update tests when behavior changes, ideally before the implementation.
- CI runs the complete matrix on each PR, so don’t default to `pnpm run test`, coverage, builds,
  browser matrices, or `pnpm run verify`. Run the full local matrix only for the exceptions in
  [Full verification](docs/agent-verification.md#full-verification).
- A hook formats files you edit with the file tools, but not shell edits. If a hook fails, fix or
  report it. Run `pnpm run lint:fix` directly before committing; it must show zero errors &
  warnings.
- After editing a TypeScript or Svelte contract, run `pnpm run check`.
- A docs-only change needs only `pnpm run lint:fix && pnpm run lint`: no tests or build.
- Hooks are conveniences, not verification evidence. Run required commands directly & confirm a zero
  exit status ([Exit status](docs/agent-verification.md#exit-status)).
- Read [agent-verification.md](docs/agent-verification.md) before verification work.

## Task scope

- Follow [Start work](docs/agent-workflow.md#start-work) for an issue, an authorized PR takeover, or
  an ad hoc task. Proceed on an unclaimed issue or an explicit handoff without asking again. Ask
  when ownership conflicts, required GitHub authentication is unavailable, or scope needs a
  decision.
- File an issue, without asking first, for these findings you don’t fix in the current change:
  - a product bug,
  - something that blocks your task,
  - a review finding or follow-up you deferred.

  Search the open issues first, and add your evidence to a match instead of filing a duplicate. A
  suggested session or task card doesn’t replace the issue.

- Log smaller frictions you worked around, such as a flaky command, a stale doc, or a guard that
  blocked a harmless read, as one comment on the pinned “Agent friction log” issue. Don’t file a
  separate issue for them. The format, borderline cases, & monthly review are in
  [agent-workflow.md](docs/agent-workflow.md#friction-log).
- Name each issue you filed, updated, or commented on in your final report, including friction-log
  entries.

- Record a dependency on another issue as a “blocked by” relationship, not a label; see
  [Blockers](docs/agent-workflow.md#blockers).
- When you file or triage a small, fully specified task, add the `delegate: small agent` label so
  the owner can hand it to Antigravity or Copilot. A self-contained piece of a larger issue
  qualifies as a sub-issue. Read [agent-workflow.md](docs/agent-workflow.md#small-agent-tasks)
  before applying the label.
- Clear existing acceptance criteria authorize the implementation. Don’t ask for approval of them
  again, reconfirm a session checklist, or write a duplicate checklist. Ask only about scope the
  criteria leave open, requirements that conflict, or decisions the criteria don’t settle.
- Identify the subsystem the change affects, its acceptance criteria, & its deliverables.
- A nontrivial feature without clear acceptance criteria needs a checklist first. Write three to
  seven acceptance items and get approval before implementing.
- Before editing, read the affected contracts, boundaries, & existing tests.
- Read [agent-workflow.md](docs/agent-workflow.md) before issue work or Git & GitHub delivery.
- Some designs call for a written specification or implementation plan before any code. For those,
  read [development-workflow.md](docs/development-workflow.md#3-planning--approval-workflow). Clear
  criteria still count as scope approval, and each checkpoint in an approved plan still applies.

## Worktrees

- Worktrees are optional. Read [agent-reference.md](docs/agent-reference.md#worktree-mechanics)
  before using one.
- To create one, run `pnpm run worktree:new <slug>` with lowercase letters, digits, & hyphens.
  `start-work issue` adds the issue number prefix. Inside a worktree that a harness created, run
  `node scripts/setup-worktree.ts` instead. Either command:
  - links the game assets & the `.worktreeinclude` entries (env files),
  - installs dependencies with the frozen lockfile,
  - runs `prepare`.
- Run setup before editing in a harness-created worktree; no hook runs it, and a read-only session
  needs none. Standard setup in an isolated, harness-created worktree is preauthorized, even after a
  missing-dependency preflight failure.
- When dependencies are absent, or a merge, pull, or rebase changes the lockfile, pnpm fails with
  `ERR_PNPM_VERIFY_DEPS_BEFORE_RUN`. In a linked worktree, run `node scripts/setup-worktree.ts`,
  which also restores missing links. Elsewhere, run `pnpm install --frozen-lockfile`. A deliberate
  dependency edit follows [Package commands](docs/agent-reference.md#package-commands) instead.
- Use the configured global pnpm store & dependencies local to the worktree. Request any sandbox
  access you need. If setup itself fails, follow “Tooling failures” below.
- Some platforms give a session a fresh, ephemeral container with its own assigned branch, such as a
  cloud session. Work directly in that checkout. Don’t create a nested worktree or replace that
  branch. Worktree setup doesn’t apply there; if pnpm reports stale dependencies, run
  `pnpm install --frozen-lockfile`.
- Start from the freshly fetched remote tip of the intended branch. Never reset existing work,
  switch a shared checkout, or discard changes to get there.
- Each editing subagent needs a worktree that its harness lets it edit. In Claude Code, spawn it
  with the Agent tool’s `isolation: "worktree"` and have it run `node scripts/setup-worktree.ts`.
- A named preview serves the session’s original folder, not the worktree. An agent in a worktree
  previews its own dev server by URL instead.
- Give each delegated agent its file ownership, its harness boundaries, & its focused test command.
  Built-in Explore & Plan subagents may not receive project memory.
- Never copy or share dependencies, caches, builds, or writable generated directories between
  worktrees.

## Tool boundaries

- Use pnpm only; the lockfile is pnpm’s. Don’t use `npm`, `npx`, `yarn`, `bun`, or `pnpx`.
- Run Wrangler from the workspace: `pnpm exec wrangler <command>`, including `login`.
- R2 uploads authenticate only with `R2_UPLOAD_TOKEN`, never a login. The upload scripts load it
  from the main checkout's `.env.r2-upload`; run them, but never read the file or print the token.
- Never read stored OAuth tokens, such as gh’s `hosts.yml` or Wrangler’s config, and never print the
  environment of a shell that may hold a token. Search with the Grep tool or plain `rg`, never
  `grep -r` or `rg -uu`, which read gitignored secrets.
- If a harness or hook refuses an edit, stop & report it. Never route around the refusal with shell
  writes, heredocs, `sed -i`, `perl -i`, or scripts.
- Before adding or bumping dependencies, follow
  [Package commands](docs/agent-reference.md#package-commands).
- Never use bare `git stash` or `git stash pop`; every worktree shares one stash stack. Prefer a WIP
  commit, or `git stash push -m <name>` & `git stash apply <sha>`.

- Read [agent-reference.md](docs/agent-reference.md#enforcement-boundaries) before changing agent
  permissions, hooks, or guarded paths.
- Inspect `assets.zip` entries or extract named subtrees. Extracting the whole archive needs the
  user’s explicit approval.
- Before declaring the game assets unavailable, look in `pipeline/input/`, or in the main checkout’s
  when a linked worktree hasn’t run setup. The “needs game installation” label alone doesn’t block a
  task.
- Before pipeline work, read [pipeline/README.md](pipeline/README.md) & the “Asset inputs” section
  of agent-reference.md.

## Architecture boundaries

- `src/lib/data/tracker-data.json` is generated; regenerate it instead of editing it. Its shared
  contract is in `src/lib/types/tracker-data.ts`.
- `src/lib/components/ui/` started as shadcn-svelte code, but the project owns it now. Edit it
  directly, and keep its MIT notice in `THIRD-PARTY-NOTICES.md`.
- Pipeline extractors throw on unexpected source data. Never invent fallback display text to cover a
  missing or unrecognized value.
- `src/lib/engine/` holds pure domain logic. Side effects belong at the store or component boundary.
- `src/lib/stores/user-state.svelte.ts` owns mutable progress & its localStorage persistence.
- Save import & backup restore are different flows, so don’t substitute one for the other:
  - Save import merges progress additively: it adds progress and never removes existing entries.
  - Backup restore replaces the serialized state.
- Assume real players have saved progress. A change to the storage or backup schema needs a version
  bump, a migration, & compatibility tests, and it never ships as a compatibility break.
- When the running build finds data that a newer build wrote, it shows a “newer data” state. Writes
  are blocked, and nothing is quarantined. Quarantine is only for data that is unreadable or fails
  validation.
- Sync uses a strict protocol version.
- Category pages compose layouts. Put shared or stateful concerns in focused components. Split a
  complex component by logical concern, even with one caller, so it’s easier to reason about.
- Before implementation, read [agent-reference.md](docs/agent-reference.md#code-conventions), which
  covers naming, imports, path handling, Svelte, lint, formatting, & colocated tests.
- Read these guides when your work touches their area:
  - [app-architecture.md](docs/app-architecture.md): app boundaries
  - [styling.md](docs/styling.md): UI, CSS, & visual direction
  - [voice.md](docs/voice.md): English copy & its voice
  - [localization.md](docs/localization.md): user-facing text
  - [save-file-format.md](docs/save-file-format.md): saves
  - [sync.md](docs/sync.md): save-driven sync (the courier, relay, following, & apply rules)
  - [mistria-wiki-api.md](docs/mistria-wiki-api.md): wiki integration
  - [cloud-agent-environments.md](docs/cloud-agent-environments.md): cloud setup

## Review gates

- A change to `.svelte` files, CSS, layout, or routes needs visual verification & attached
  screenshots before it’s done. Follow [Visual checks](docs/agent-verification.md#visual-checks).
  Don’t attach screenshots to a PR that meets a
  [visual exemption](docs/agent-verification.md#visual-exemptions).
- Most PRs need a fresh-context self-review; see
  [Review selection](docs/agent-verification.md#review-selection).
- [High-risk surfaces](docs/agent-verification.md#high-risk-surfaces) need full local verification &
  an especially careful review.
- A request to review is a request to post; see
  [Review records](docs/agent-verification.md#review-records).
- A review doesn’t authorize a reviewing agent to fix what it reviews; it addresses findings only
  when asked. The implementing agent resolves findings on its own PR.

## Delivery gates

- Keep the owner’s commit identity & any existing attribution.
- Every commit an agent materially wrote needs that agent’s stable product `Co-Authored-By` trailer,
  such as `Co-Authored-By: Codex <codex@openai.com>`.
- Every agent-authored issue body & substantive GitHub comment ends with `Agent: <agent-id>`.
- Commit, push, & open a PR. Its body includes `Closes #N` & a preview URL from the deployment
  integration or the PR template when a preview is available. Use `Refs #N` instead when the issue
  needs work after the merge.
- Record each decision in the narrowest home that fits, usually the PR’s “Decisions” section. Add a
  record to `docs/decisions/` only when a newcomer would propose the rejected alternative; see
  [Recording decisions](docs/agent-workflow.md#recording-decisions).
- Pass multiline GitHub bodies with `--body-file`, and re-read the published result.
- A draft PR isn’t ready for human review. A ready PR is one you’d merge if CI passes. Keep it a
  draft while any manual step, question, gap, or agent review remains, and return it to draft if
  that changes. See [Draft or ready](docs/agent-workflow.md#draft-or-ready), which also says who
  marks a PR ready.
- Ready is independent of CI. Mark a PR ready when you think it’s ready, without waiting for CI to
  pass; the maintainer reviews & merges only PRs that are both ready & passing.
- Before marking a PR ready, make its body describe the final state; see
  [Final state](docs/agent-workflow.md#final-state).
- Marking a PR ready doesn’t end your ownership. Watch CI & fix failures on the branch until it
  passes. If no “CI” run starts a few minutes after you open the PR, follow the workflow’s
  empty-commit recovery.
- Only the maintainer merges PRs.
- Never change `package.json`’s version or create Git tags without an approved release. Production
  versions come from Git metadata.

## Tooling failures

Remote CI setup has one retry exception; see
[Remote setup retry](docs/agent-verification.md#remote-setup-retry).

Missing or stale project dependencies are routine setup. Agents may run
`pnpm install --frozen-lockfile` without further approval, using the configured external store &
leaving the lockfile unchanged. That permission doesn’t cover adding or bumping dependencies, or
changing the runtime, authentication, or package-manager configuration. If the frozen install fails,
follow the procedure below; don’t retry with a workaround.

When a local tooling or environment problem blocks the task, **stop on the first occurrence and
report it**. Examples include a missing tool, the wrong runtime version, a broken or unconfigured
install, & an authentication failure. The preauthorized worktree setup above is an exception.
Wrangler is the standard example: if `pnpm exec wrangler` is missing, unconfigured, or an upload
runs without `R2_UPLOAD_TOKEN`, report that. Don’t install it, run `wrangler login`, or upload some
other way.

- **Report it immediately,** before anything else. Include the failing command, the relevant error
  (with tokens & other credentials redacted), & the work it blocks.
- **Diagnose without changing anything.** Run `node scripts/machine-doctor.ts`, which reports each
  prerequisite as ok, missing, or wrong, and include its output. Run it with `node`, not through
  pnpm, which would check the wrong runtime. Pass `--for` with the sections your task needs
  (`browser`, `pipeline`, or `release`; the core section always runs), so unrelated prerequisites
  like game assets don’t show up as failures. The setup procedure is in
  [machine-setup.md](docs/machine-setup.md).
- **Then wait for the user’s explicit direction.** Unless the user says to, don’t install,
  configure, authenticate, substitute a tool, skip or bypass a check, or retry with a workaround.
  Retrying the same command isn’t a fix. Asking for sandbox access that the task already needs isn’t
  a workaround.
- **Missing Playwright browsers are a standing exception.** When a required browser check needs a
  browser binary that’s missing, install it with the workspace’s Playwright, then run the check. For
  example: `pnpm exec playwright install chromium`. Use the external browser cache, request sandbox
  access if needed, & report the install. This exception doesn’t cover dependency changes, system
  packages, or a different browser or executable.
- **Repository bugs count too.** A documented command that fails, or a doc that’s out of date,
  blocks you the same way. While you report it, search the open issues for it. Add your evidence to
  an existing issue, or file one with the symptom & a guess at the cause. The user decides whether
  to work around it.

## Context economy

- Read only the sections you need, using Read’s `offset` & `limit`. Don’t read the generated tracker
  data; Claude Code’s permissions deny it. Read its types or the pipeline source instead.
- Don’t reread context you already have. After context compression, reread only the section you
  need.
- Don’t pin a model or reasoning effort in the repository’s harness settings. Each contributor’s own
  preferences apply.
