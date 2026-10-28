# Mistria agent guide

Universal rules for every agent working in this repository. `CLAUDE.md` imports this file; Codex
discovers it as project instructions. Follow task-trigger links below before the relevant work,
rather than loading every reference at session start. Read the relevant heading, not each whole
linked file. User instructions & harness restrictions take precedence. Personal agent workflows
(model choice, delegation, review habits, session limits) belong in each contributor’s user config,
not here.

## Focused verification

- Every agent runs the test covering its change: `pnpm exec vitest run path/to/file.test.ts`. The
  path selects any project, including `*.client.test.ts` & `*.cold.test.ts`.
- Add or update tests for behavioral changes, preferably before implementation. Run focused tests
  during development; CI runs the complete matrix on each PR. Do not default to `pnpm run test`,
  coverage, builds, browser matrices, or `pnpm run verify`.
- Hooks format edits & fix/check changed files at stop; on failure, fix or report it, and run
  `pnpm run lint:fix` directly before committing (zero errors & warnings).
- Run `pnpm run check` after a TypeScript or Svelte contract edit.
- Documentation-only changes require `pnpm run lint:fix && pnpm run lint` only, with no tests or
  build. Hooks are conveniences, not verification evidence; run commands directly & confirm zero
  exit status. Preserve command status when trimming output; never trust a bare `command | tail`.
- Read [agent-verification.md](docs/agent-verification.md) before verification work. It defines the
  relevant visual checklist, review procedure, CI coverage, full-matrix flags, & failure retries.
- Run full local verification once, when commit-ready, only for pipeline parser, evaluator,
  extractor, generated tracker data, or shared tracker-contract changes; high-risk surfaces below;
  CI failures not reproducible with focused tests; or checks CI does not run for the changed paths.
  Pipeline & shared-contract changes additionally require asset tests & a real pipeline run.
- After a full-matrix failure, fix it, rerun only the failed step, then rerun the matrix once. After
  it passes, rerun only after further code changes. Inspect failed CI logs once with
  `gh run view <id> --log-failed`.

## Task scope

- Read the issue & comments before issue work:
  `gh issue view <number> --json title,body,labels,comments`. Avoid `--comments` alone, which can
  return empty output. Do not start `status: blocked` or `status: needs decision` issues. Coordinate
  with the owner if `status: in progress` or an `agent:*` label already exists.
- Clear existing acceptance criteria authorize implementation. Do not ask for approval of them
  again, reconfirm a session checklist, or create a duplicate checklist. Ask only about unresolved
  scope, conflicting requirements, or decisions the criteria do not settle.
- Identify the subsystem, acceptance criteria, & deliverables. For nontrivial features without clear
  acceptance criteria, write a three to seven item acceptance checklist & obtain approval before
  implementation. Read affected contracts, boundaries, & existing tests before editing.
- Read [agent-workflow.md](docs/agent-workflow.md) before issue work or Git/GitHub delivery. Read
  [development-workflow.md](docs/development-workflow.md#3-planning--approval-workflow) when design
  requires specification or implementation-plan gates; clear criteria still satisfy scope approval.
  Respect approved plan checkpoints.

## Worktrees

- Worktrees are optional. To use one, run
  `pnpm run worktree:new <issue-number>-<short-description>`, or `node scripts/setup-worktree.ts`
  inside a harness-created worktree. Setup links the game assets & `.worktreeinclude` entries (env
  files), installs with the frozen lockfile, & runs `prepare`. Read
  [agent-reference.md](docs/agent-reference.md#worktree-mechanics) first.
- Standard setup in an isolated harness-created worktree is preauthorized: `SessionStart` hooks run
  it automatically, & you run `node scripts/setup-worktree.ts` when dependencies or its links are
  still absent, including after a missing-dependency preflight failure. Use the configured global
  pnpm store & worktree-local dependencies; request any required sandbox access. If setup itself
  fails, follow “Tooling failures” below.
- A fresh, platform-managed ephemeral container with a session-isolated assigned branch works
  directly in its checkout. Do not create a nested worktree or replace that branch.
- Start from the refreshed remote tip of the intended branch. Never reset existing work, switch a
  shared checkout, or discard changes to refresh.
- Each editing subagent needs a worktree its harness permits it to edit. Claude Code uses Agent
  `isolation: "worktree"` & `node scripts/setup-worktree.ts`. A named preview serves the session’s
  original folder, so any agent in a worktree previews its own server by URL. Supply each delegation
  with file ownership, harness boundaries, & its focused test command; built-in Explore & Plan
  subagents may not receive project memory.
- Never copy or share dependencies, caches, builds, or writable generated directories between
  worktrees.

## Tool boundaries

- Use pnpm exclusively; the lockfile is pnpm’s. Do not use `npm`, `npx`, `yarn`, `bun`, or `pnpx`.
  Use workspace Wrangler: `pnpm exec wrangler <command>`, including login. Never read or expose
  stored OAuth tokens.
- If a harness or hook refuses an edit, stop & report it. Never bypass the refusal with shell
  writes, heredocs, `sed -i`, `perl -i`, or scripts.
- Before dependency additions or bumps, read
  [agent-reference.md](docs/agent-reference.md#package-commands), run
  `pnpm audit --audit-level=moderate`, & inspect flagged transitives with `pnpm why`. Do not add an
  unpatched advisory tree. Disputed or unfixable advisories require a documented
  `auditConfig.ignoreGhsas` exception in `pnpm-workspace.yaml`.
- Existing guarded-path, attribution, permission-parity, & shell rules enforce only their stated
  surfaces. Read [agent-reference.md](docs/agent-reference.md#enforcement-boundaries) before
  changing agent permissions or guarded paths; hooks do not replace policy, verification, or harness
  consent.
- Do not unpack the full `assets.zip` without explicit user approval. Read directly or materialize
  only needed subtrees. Before declaring game assets unavailable, inspect `pipeline/input/`; the
  “needs game installation” label alone is not a blocker. Read
  [pipeline/README.md](pipeline/README.md) & the reference’s Asset inputs before pipeline work.

## Architecture boundaries

- Hooks deny edits of generated `src/lib/data/tracker-data.json`; regenerate it, & read
  `src/lib/types/tracker-data.ts` for the shared contract. `src/lib/components/ui/` began as
  shadcn-svelte code but is project-owned: edit it directly, & keep its MIT notice in
  `THIRD-PARTY-NOTICES.md`.
- Pipeline extractors throw on unexpected source data. Never invent fallback display text to paper
  over a missing or unrecognized value.
- `src/lib/engine/` is pure domain logic; side effects belong at store or component boundaries.
  `src/lib/stores/user-state.svelte.ts` owns mutable progress & localStorage persistence.
- Save import merges progress additively; backup restore replaces serialized state. Do not
  substitute one flow for the other. Assume real players hold saved progress: a storage or backup
  schema change needs a version bump, a migration, & compatibility tests, and never ships as a
  compatibility break. Transfer codes bind to the exact app build, so they need none of these.
- Data written by a newer build than the running one shows a “newer data” state with writes blocked
  & nothing quarantined; quarantine is only for data that is unreadable or invalid (fails
  validation). The progress-transfer QR stays build-bound until sync deprecates it, and sync uses a
  strict protocol version.
- Category pages compose layouts. Put shared or stateful concerns in focused components; divide
  complex components by logical concern even with one call site, for reasoning clarity.
- `docs/superpowers/` contains historical plans, specs, & notes. It is hidden from ripgrep by
  `.ignore`. Read only when a task names a file; never revise historical prose for later changes.
  Update current `docs/*.md` instead.
- Before implementation, read [agent-reference.md](docs/agent-reference.md#code-conventions), which
  preserves all naming, imports, path-handling, Svelte, lint, formatting, & colocated-test
  conventions. Read [app-architecture.md](docs/app-architecture.md) for app boundaries,
  [styling.md](docs/styling.md) for UI/CSS & visual direction,
  [localization.md](docs/localization.md) for user-facing text,
  [save-file-format.md](docs/save-file-format.md) for saves, [sync.md](docs/sync.md) for save-driven
  sync (the courier, relay, pairing, & apply rules), [mistria-wiki-api.md](docs/mistria-wiki-api.md)
  for wiki integration, & [cloud-agent-environments.md](docs/cloud-agent-environments.md) for cloud
  setup when relevant.

## Review gates

- Changes to `.svelte`, CSS, layout, or routes require visual verification before completion:
  changed routes, desktop (~1280) & mobile (~390), changed interactions & a reversal, light & dark
  modes, relevant empty/loaded/error/disabled states, & console errors. Cap at 10 screenshots per
  PR; compare any design reference, & record omissions under “Not verified” in the PR description.
- Docs-only, pipeline-only, & test-only changes are visually exempt. Pure engine changes are exempt
  unless they affect rendered output. Use the complete checklist in agent-verification.md.
- Most PRs need a fresh-context self-review. High-risk surfaces need full local verification &
  especially careful review: engine/state-machine/transfer logic, pipeline extractors or schemas,
  persistence or save/import/export flows, auth/abuse/security boundaries, & changes spanning five
  or more files with cross-cutting concerns.
- Review the merge-base diff in one pass; re-review once only after substantial high-severity fixes.
  Reviewing does not authorize fixes; address findings only when asked.

## Delivery gates

- Preserve the owner’s commit identity & existing attribution. Every materially agent-authored
  commit needs the stable product `Co-Authored-By` trailer; every issue/PR body & substantive GitHub
  comment ends with `Agent: <agent-id>`. Agent-authored PRs get exactly one matching established
  `agent:*` label. The “Attribution” check covers commits, PR bodies (including the preview URL), &
  labels, not issues or comments.
- Commit, push, & open an attributed PR with `Closes #N` & the branch-preview URL. Pass multiline
  bodies with `--body-file`, never escaped `\n`, & re-read the result.
- An open PR’s state is a merge recommendation. Open as draft while any manual step, question, gap,
  or review remains. Mark ready only when you would merge it yourself; return to draft if that
  changes. Monitor CI & fix failures on the branch; do not merge around failing CI. If “CI” never
  starts a few minutes after opening, follow the workflow’s empty-commit recovery.
- Do not change `package.json`’s version or create version tags unless explicitly cutting a release.
  Obtain user approval for the release version first; production versions derive from Git metadata.

## Tooling failures

Absent or stale project dependencies are a routine setup step: agents may run
`pnpm install --frozen-lockfile` without additional approval, using the configured external store
and preserving the lockfile. This permission covers neither dependency additions or bumps nor
changes to runtime, authentication, or package-manager configuration. If the frozen install fails,
follow the stop, report, & diagnose procedure below; do not retry with a workaround.

When a local tooling or environment issue blocks the task (a missing tool, wrong runtime version,
broken or unconfigured install, authentication failure, or any other local setup problem), **stop on
the first occurrence and report it**, except for the preauthorized standard worktree setup above.
Wrangler is the standard example: if `pnpm exec wrangler` is missing, unconfigured, or not logged
in, report that; do not install it, run `wrangler login`, or substitute another upload path.

- **Report immediately,** before any other action: the failing command or operation, the relevant
  error (redact tokens & other credentials), & the work it blocks.
- **Diagnose read-only.** `node scripts/machine-doctor.ts` reports each prerequisite as ok, missing,
  or wrong without changing anything; run it with `node`, not through pnpm, which would check the
  wrong runtime; include its output. Pass `--for` with the sections your task needs (`browser`,
  `pipeline`, `release`; core always runs), so unrelated prerequisites such as game assets do not
  read as failures. The setup procedure is [machine-setup.md](docs/machine-setup.md).
- **Then wait for the user’s explicit direction.** Do not install, configure, authenticate,
  substitute a tool, skip or bypass a check, or retry with a workaround unless the user directs it.
  Retrying the same command is not a fix. Requesting a sandbox escalation for the operation the task
  already requires is not a workaround.
- **Missing Playwright browsers are a standing exception.** When a required browser check needs a
  missing browser binary, install that component with workspace Playwright, for example
  `pnpm exec playwright install chromium --only-shell`, then run the check. Use the external browser
  cache, request sandbox access if needed, & report the install. This does not authorize dependency
  changes, system-package installation, or substituting another browser or executable.
- **Repository bugs are included.** A failing documented command or stale doc blocks you the same
  way. Search open issues for it while you report; add evidence to an existing issue, or offer to
  file one with the symptom & a root-cause guess. The user decides whether to proceed around it.

## Context economy

- Use Read `offset` & `limit` for needed sections; hooks deny generated tracker-data reads, so read
  the types or pipeline source instead.
- Do not reread context already present; after compression, reread only the needed section.
- Do not pin a model or reasoning effort in repository harness settings; each contributor’s own
  preferences apply.
