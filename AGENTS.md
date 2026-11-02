# Mistria agent guide

These rules apply to every agent working in this repository. Claude Code reads this file through
`CLAUDE.md`, and Codex reads it as project instructions.

The links below point to longer guides. Before the work a link covers, read that guide’s relevant
heading, not the whole file; don’t load every guide at session start. User instructions & harness
restrictions take precedence. Personal agent workflows (model choice, delegation, review habits,
session limits) belong in each contributor’s user config.

## Focused verification

- Run the test that covers your change: `pnpm exec vitest run path/to/file.test.ts`. For plain-Node
  tests under `eslint-rules/`, `scripts/`, & `tests/`, also select `--project node`, or
  `--project node-isolated` for `*.isolated.test.ts`. For example:
  `pnpm exec vitest run --project node scripts/guard-generated-reads.test.ts`. A path alone selects
  the right tests, but can still start the app projects’ Cloudflare proxy & workerd before
  filtering. Use `--project pipeline` for asset-independent `pipeline/` tests. App tests, including
  `*.client.test.ts` & `*.cold.test.ts`, can use the path-only command.
- Add or update tests when behavior changes, ideally before the implementation.
- Run focused tests during development. CI runs the complete matrix on each PR, so don’t default to
  `pnpm run test`, coverage, builds, browser matrices, or `pnpm run verify`.
- Hooks format edits, and they fix & check changed files when you stop. If a hook fails, fix or
  report it. Run `pnpm run lint:fix` directly before committing; it must show zero errors &
  warnings.
- After editing a TypeScript or Svelte contract, run `pnpm run check`.
- A docs-only change needs only `pnpm run lint:fix && pnpm run lint`: no tests or build.
- Hooks are conveniences, not verification evidence. Run required commands directly & confirm a zero
  exit status. When trimming output, keep the exit status: a bare `command | tail` reports `tail`’s.
- Read [agent-verification.md](docs/agent-verification.md) before verification work. It covers the
  visual checklist, the review procedure, what CI runs, the full-matrix flags, & how to retry
  failures.
- Run full local verification once, when the change is ready to commit, and only in these cases:
  - The change touches the pipeline parser, evaluator, extractors, generated tracker data, or shared
    tracker contract.
  - The change touches a high-risk surface (see “Review gates”).
  - A CI failure doesn’t reproduce with focused tests.
  - The changed paths have checks that CI doesn’t run.

  Pipeline & shared-contract changes also need the asset tests & a real pipeline run.

- If the full matrix fails, fix the failure and rerun only the failed step. Then rerun the matrix
  once. After it passes, rerun it only if you change code again.
- To inspect a failed CI run, run `gh run view <id> --log-failed` once.

## Task scope

- Before working on an issue, read it, its comments, & its relationships:
  `gh issue view <number> --json title,body,labels,comments,blockedBy,parent`. Don’t use
  `--comments` alone, which can return empty output.
- Don’t start an issue that’s blocked by an open issue, or one labeled `status: blocked` or
  `status: needs decision`. If an issue already has `status: in progress` or an `agent:*` label,
  coordinate with its owner.
- File an issue for anything you find & don’t fix in the current change, without asking first. Extra
  issues are cheap to close; a problem mentioned only in a session is lost. This includes:
  - a bug or stale doc you noticed in passing,
  - a flaky test or CI failure you reran past,
  - a review finding or follow-up you deferred.

  Search the open issues first, and add your evidence to a match instead of filing a duplicate. Name
  each issue you filed or updated in your final report. A suggested session or task card doesn’t
  replace the issue.

- Record a dependency on another issue as a “blocked by” relationship, not a label:
  `gh issue edit <number> --add-blocked-by <other>`. Keep `status: blocked` for blockers outside the
  tracker, such as time, hardware, or a third party, and name the blocker in a comment.
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
- To create one, run `pnpm run worktree:new <issue-number>-<short-description>`. Inside a worktree
  that a harness created, run `node scripts/setup-worktree.ts` instead. Either command:
  - links the game assets & the `.worktreeinclude` entries (env files),
  - installs dependencies with the frozen lockfile,
  - runs `prepare`.
- Standard setup in an isolated, harness-created worktree is preauthorized. `SessionStart` hooks run
  it automatically. If dependencies or setup’s links are still missing, run it yourself, even after
  a missing-dependency preflight failure.
- Use the configured global pnpm store & dependencies local to the worktree. Request any sandbox
  access you need. If setup itself fails, follow “Tooling failures” below.
- Some platforms give a session a fresh, ephemeral container with its own assigned branch. Work
  directly in that checkout. Don’t create a nested worktree or replace that branch.
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
- Stored OAuth token reads are forbidden; the read guard covers the known gh & Wrangler files and
  `.env.r2-upload`. Never print the environment of a shell that may hold a token. Search with the
  Grep tool or plain `rg`, never `grep -r` or `rg -uu`, which read gitignored secrets.
- If a harness or hook refuses an edit, stop & report it. Never route around the refusal with shell
  writes, heredocs, `sed -i`, `perl -i`, or scripts.
- Dependency commands inject audit guidance. Follow
  [Package commands](docs/agent-reference.md#package-commands) before adding or bumping
  dependencies.

- The existing guards each enforce only the surface they name: guarded paths, attribution,
  permission parity, & shell rules. Hooks don’t replace policy, verification, or the harness’s
  consent prompts. Read [agent-reference.md](docs/agent-reference.md#enforcement-boundaries) before
  changing agent permissions or guarded paths.
- Inspect `assets.zip` entries or extract named subtrees. Full extraction needs user approval &
  inherited `MISTRIA_ALLOW_FULL_ASSETS=1` (see “Policy guards” in agent-reference.md).
- Before declaring the game assets unavailable, look in `pipeline/input/`. The “needs game
  installation” label alone doesn’t block a task.
- Before pipeline work, read [pipeline/README.md](pipeline/README.md) & the “Asset inputs” section
  of agent-reference.md.

## Architecture boundaries

- `src/lib/data/tracker-data.json` is generated, and hooks deny edits to it. Regenerate it instead.
  Its shared contract is in `src/lib/types/tracker-data.ts`.
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
  bump, a migration, & compatibility tests, and it never ships as a compatibility break. Transfer
  codes are tied to the exact app build, so they need none of these.
- When the running build finds data that a newer build wrote, it shows a “newer data” state. Writes
  are blocked, and nothing is quarantined. Quarantine is only for data that is unreadable or fails
  validation.
- The progress-transfer QR code stays tied to the app build until sync deprecates it. Sync uses a
  strict protocol version.
- Category pages compose layouts. Put shared or stateful concerns in focused components. Split a
  complex component by logical concern, even with one caller, so it’s easier to reason about.
- `docs/superpowers/` is guarded history, hidden from ripgrep by `.ignore`. Read it only when a task
  names a file; update the current `docs/*.md` for later changes.
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

- A change to `.svelte` files, CSS, layout, or routes needs visual verification before it’s done,
  unless it meets a [visual exemption](docs/agent-verification.md#visual-exemptions). Check:
  - each changed route,
  - desktop (~1280) & mobile (~390) widths,
  - each changed interaction & one way to reverse it,
  - light & dark modes,
  - the relevant empty, loaded, error, & disabled states,
  - console errors.
- Take at most 10 screenshots per PR. Compare against a design reference if one exists. List
  anything you didn’t check under “Not verified” in the PR description.
- Attach the verification screenshots to the PR body: at least one per changed route or component,
  at desktop & mobile widths, showing the changed state. A visual PR with no attached screenshots
  isn’t ready for review.
- Docs-only, pipeline-only, & test-only changes don’t need visual checks. Pure engine changes don’t
  either, unless they change rendered output. Accessibility-only changes, such as a checkbox’s
  accessible label, don’t need visual checks or screenshots when visible content, layout, focus
  behavior, & interactions stay unchanged. Verify the accessibility behavior with focused tests. The
  complete checklist is in agent-verification.md.
- Most PRs need a fresh-context self-review, such as a subagent that didn’t write the change reading
  its diff cold.
- A request to review is a request to post. Post the review on GitHub (`gh pr review --comment`, or
  an issue comment when there’s no PR), even when it has no findings. Don’t leave it only in the
  session. The format is under “Review records” in agent-verification.md.
- High-risk surfaces need full local verification & an especially careful review. They are:
  - engine, state-machine, or transfer logic,
  - pipeline extractors or schemas,
  - persistence, or the save, import, & export flows,
  - auth, abuse, or security boundaries,
  - changes across five or more files with cross-cutting concerns.
- Review the merge-base diff (the branch’s changes since it left its base branch) in one pass.
  Re-review once, and only after substantial fixes for high-severity findings.
- A review doesn’t authorize fixes. Address findings only when asked.

## Delivery gates

- Keep the owner’s commit identity & any existing attribution.
- Every commit an agent materially wrote needs that agent’s stable product `Co-Authored-By` trailer,
  such as `Co-Authored-By: Codex <codex@openai.com>`.
- Every issue body, PR body, & substantive GitHub comment ends with `Agent: <agent-id>`.
- An agent-authored PR gets exactly one matching `agent:*` label from the established set.
- The “Attribution” check covers commits, PR bodies (including the preview URL), & labels. It
  doesn’t check issues or comments.
- Commit, push, & open an attributed PR. Its body includes `Closes #N` & the branch-preview URL.
- GitHub body guards require `--body-file` for multiline text & a final `Agent:` line. Re-read the
  published result.
- An open PR’s state is your merge recommendation. Keep it a draft while any manual step, question,
  gap, or review remains. Mark it ready only when you would merge it yourself, and return it to
  draft if that changes.
- Watch CI & fix failures on the branch. Don’t merge around failing CI. If no “CI” run starts a few
  minutes after you open the PR, follow the workflow’s empty-commit recovery.
- Release metadata is guarded. For an approved release version, the user enables inherited
  `MISTRIA_RELEASE=1`. Production versions come from Git metadata.

## Tooling failures

Remote CI setup has one retry exception: an agent may run `gh run rerun <id> --failed` once when the
logs identify a transient network or service problem, such as a registry download timeout. Merely
failing before tests is insufficient. Missing credentials, incompatible runtimes, & broken
configuration remain stop-&-report conditions. Test, lint, type-check, & build failures never
qualify. Record the original failure, rerun link, & outcome on the PR. If the retry fails, stop
dependent work & follow the existing reporting procedure. This exception does not apply to local
tooling failures or authorize installation, authentication, or runtime changes.

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
  example: `pnpm exec playwright install chromium --only-shell`. Use the external browser cache,
  request sandbox access if needed, & report the install. This exception doesn’t cover dependency
  changes, system packages, or a different browser or executable.
- **Repository bugs count too.** A documented command that fails, or a doc that’s out of date,
  blocks you the same way. While you report it, search the open issues for it. Add your evidence to
  an existing issue, or file one with the symptom & a guess at the cause. The user decides whether
  to work around it.

## Context economy

- Read only the sections you need, using Read’s `offset` & `limit`. Hooks deny reads of the
  generated tracker data, so read its types or the pipeline source instead.
- Don’t reread context you already have. After context compression, reread only the section you
  need.
- Don’t pin a model or reasoning effort in the repository’s harness settings. Each contributor’s own
  preferences apply.
