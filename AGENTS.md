# Mistria agent guide

Universal rules for every agent. `CLAUDE.md` imports this file; Codex discovers it as project
instructions. Follow task-trigger links below before the relevant work, rather than loading every
reference at session start. Read the relevant heading, not each whole linked file. User instructions
& harness restrictions take precedence.

## Focused verification

- Every agent runs the test covering its change: `pnpm exec vitest run path/to/file.test.ts`. The
  path selects any project, including `*.client.test.ts` & `*.cold.test.ts`.
- Add or update tests for behavioral changes, preferably before implementation. Run focused tests
  during development; CI runs the complete matrix on each PR. Do not default to `pnpm run test`,
  coverage, builds, browser matrices, or `pnpm run verify`.
- Run `pnpm run check` after a TypeScript or Svelte contract edit. Run `pnpm run lint:fix` before
  committing; lint must have zero errors & warnings. Use the narrowest justified lint suppression.
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
- Clear existing acceptance criteria authorize implementation. Do not ask the maintainer to approve
  them again, reconfirm a session checklist, or create a duplicate checklist. Ask only about
  unresolved scope, conflicting requirements, or decisions the criteria do not settle.
- Identify the subsystem, acceptance criteria, & deliverables. For nontrivial features without clear
  acceptance criteria, write a three to seven item acceptance checklist & obtain approval before
  implementation. Read affected contracts, boundaries, & existing tests before editing.
- For issue-backed implementation, claim immediately before setup or implementation: replace the
  current `status:*` label with `status: in progress` & exactly one `agent:*` label for the
  top-level orchestrator. Subagents inherit that identity. Keep active labels through review;
  replace the owner on handoff. Remove both when work closes, is abandoned, or stops for a decision
  or dependency, then set the appropriate remaining status. Filing an issue alone does not claim it.
- Read [agent-workflow.md](docs/agent-workflow.md) before issue work, Git/GitHub delivery, reviews,
  or handoffs. Read
  [development-workflow.md](docs/development-workflow.md#3-planning--approval-workflow) when design
  requires specification or implementation-plan gates; clear criteria still satisfy scope approval.
  Respect approved plan checkpoints.

## Worktree isolation

- Create an isolated branch & worktree immediately for tracked-file changes, including code, config,
  docs, tests, CI, licenses, & gitignore. Only the user may grant a local/shared-checkout exception.
  Read-only audits, triage, reviews, log analysis, & scratchpad-only output may use the main
  checkout.
- A fresh, platform-managed ephemeral container with a guaranteed session-isolated assigned branch
  works directly in its checkout. Do not create a nested worktree or replace that branch.
- Harness-created worktrees are acceptable. Read
  [agent-reference.md](docs/agent-reference.md#worktree-mechanics) before worktree setup. Use
  `pnpm run worktree:new <issue-number>-<short-description>` or `pnpm run worktree:setup` inside an
  existing harness worktree. Setup links `.worktreeinclude`, installs with the frozen lockfile, &
  runs `prepare`; use Node 24 per `.node-version` & verify a clean baseline with focused checks.
- Refresh the intended starting branch before edits. The creation script fetches it; harness-created
  worktrees must start at the refreshed remote tip. Existing starting branches use
  `git pull --ff-only`. Never reset existing work, switch a shared checkout, or discard changes to
  refresh.
- Each editing subagent needs a worktree its harness permits it to edit. Claude Code uses Agent
  `isolation: "worktree"` & `pnpm run worktree:setup`; a named preview serves the orchestrator’s
  checkout, so preview the subagent’s own server by URL. Read the linked setup mechanics first.
  Supply each delegation with file ownership, harness boundaries, & its focused test command;
  built-in Explore & Plan subagents may not receive project memory.
- Never copy or share dependencies, caches, builds, or writable generated directories between
  worktrees. Stashes share one stack: prefer a WIP commit; address required stashes by commit ID,
  never bare `pop` or `apply`. Read the workflow’s stash procedure before using it.
- If a harness refuses an edit, stop & report it. Never bypass the refusal with shell writes,
  heredocs, `sed -i`, `perl -i`, or scripts.

## Tool boundaries

- Use pnpm exclusively. Do not use `npm`, `npx`, `yarn`, `bun`, or `pnpx`. Use workspace Wrangler:
  `pnpm exec wrangler <command>`, including login. Never read or expose stored OAuth tokens.
- Before dependency additions or bumps, read
  [agent-reference.md](docs/agent-reference.md#package-commands), run
  `pnpm audit --audit-level=moderate`, & inspect flagged transitives with `pnpm why`. Do not add an
  unpatched advisory tree. Disputed or unfixable advisories require a documented
  `auditConfig.ignoreGhsas` exception in `pnpm-workspace.yaml`.
- Keep the HTTPS remote & `gh auth`; pushing & signing must not prompt. Local signing uses
  `ssh-keygen`, without 1Password. Unsigned sandbox commits are acceptable; never copy private keys.
- Existing guarded-path, attribution, permission-parity, & shell rules enforce only their stated
  surfaces. Read [agent-reference.md](docs/agent-reference.md#enforcement-boundaries) before
  changing agent permissions or guarded paths; hooks do not replace policy, verification, or harness
  consent.
- Do not unpack the full `assets.zip` without explicit user approval. Read directly or materialize
  only needed subtrees. Before declaring game assets unavailable, inspect `pipeline/input/`; the
  “needs game installation” label alone is not a blocker. Read
  [pipeline/README.md](pipeline/README.md) & the reference’s Asset inputs before pipeline work.

## Architecture boundaries

- Never hand-edit generated `src/lib/data/tracker-data.json` or vendored `src/lib/components/ui/`.
  The shared pipeline/app contract is `src/lib/types/tracker-data.ts`.
- `src/lib/engine/` is pure domain logic; side effects belong at store or component boundaries.
  `src/lib/stores/user-state.svelte.ts` owns mutable progress & localStorage persistence.
- Save import merges progress additively; backup restore replaces serialized state. Do not
  substitute one flow for the other. Transfer schema or deterministic generated-data ordering
  changes require compatibility tests & deliberate versioning.
- Category pages compose layouts. Put shared or stateful concerns in focused components; divide
  complex components by logical concern even with one call site, for reasoning clarity.
- `docs/superpowers/` contains historical plans, specs, & notes. It is hidden from ripgrep by
  `.ignore`. Read only when a task names a file; never revise historical prose for later changes.
  Update current `docs/*.md` instead.
- Before implementation, read [agent-reference.md](docs/agent-reference.md#code-conventions), which
  preserves all naming, imports, Svelte, lint, formatting, & colocated-test conventions. Read
  [app-architecture.md](docs/app-architecture.md) for app boundaries, [styling.md](docs/styling.md)
  for UI/CSS, [localization.md](docs/localization.md) for user-facing text,
  [save-file-format.md](docs/save-file-format.md) for saves,
  [mistria-wiki-api.md](docs/mistria-wiki-api.md) for wiki integration, &
  [cloud-agent-environments.md](docs/cloud-agent-environments.md) for cloud setup when relevant.

## Review gates

- Changes to `.svelte`, CSS, layout, or routes require visual verification before completion:
  changed routes, desktop (~1280) & mobile (~390), changed interactions & a reversal, light & dark
  modes, relevant empty/loaded/error/disabled states, & console errors. Cap at 10 screenshots per
  PR; compare any design reference, & record omissions under “Not verified” in the PR description.
- Docs-only, pipeline-only, & test-only changes are visually exempt. Pure engine changes are exempt
  unless they affect rendered output. Use the complete checklist in agent-verification.md.
- Most PRs need a fresh-context self-review. Independent cross-agent adversarial review & full local
  verification are required for engine/state-machine/transfer logic, pipeline extractors or schemas,
  persistence or save/import/export flows, auth/abuse/security boundaries, & changes spanning five
  or more files with cross-cutting concerns.
- Use one merge-base diff review, with one re-review only for substantial fixes to high-severity
  findings. Keep prompts to base, changed files, invariants, & severity threshold. Post durable
  findings & resolutions under the workflow’s Review records rules. Reviewing does not authorize
  fixes; address findings only when asked.

## Delivery gates

- Preserve the owner’s commit identity & existing attribution. Every materially agent-authored
  commit needs the stable product `Co-Authored-By` trailer; every issue/PR body & substantive GitHub
  comment ends with `Agent: <agent-id>`. PRs & claimed issues get exactly one matching established
  `agent:*` label. Read the full attribution rules before creating or editing these artifacts.
- Commit, push, & open an attributed PR with `Closes #N` & the derived branch-preview URL. Read
  agent-workflow.md for exact slug derivation, multiline bodies, screenshot attachments, & labels.
- An open PR’s state is a merge recommendation. Open as draft while any manual step, question, gap,
  or review remains. Mark ready only when you would merge it yourself; return to draft if that
  changes. Monitor CI & fix failures on the branch; do not merge around failing CI. If “CI” never
  starts a few minutes after opening, follow the workflow’s empty-commit recovery.
- Do not change `package.json`’s version or create version tags unless explicitly cutting a release.
  Obtain user approval for the release version first; production versions derive from Git metadata.

## Tooling failures

When a local tooling or environment issue blocks the task (a missing tool, wrong runtime version,
broken or unconfigured install, authentication failure, or any other local setup problem), **stop on
the first occurrence and report it**. Wrangler is the standard example: if `pnpm exec wrangler` is
missing, unconfigured, or not logged in, report that; do not install it, run `wrangler login`, or
substitute another upload path.

- **Report immediately,** before any other action: the failing command or operation, the relevant
  error (redact tokens & other credentials), & the work it blocks.
- **Diagnose read-only.** `pnpm run machine:doctor` reports each prerequisite as ok, missing, or
  wrong without changing anything; include its output. The setup procedure is
  [machine-setup.md](docs/machine-setup.md).
- **Then wait for the user’s explicit direction.** Do not install, configure, authenticate,
  substitute a tool, skip or bypass a check, or retry with a workaround unless the user directs it.
  Retrying the same command is not a fix. Requesting a sandbox escalation for the operation the task
  already requires is not a workaround.
- **Repository bugs are included.** A failing documented command or stale doc blocks you the same
  way. Search open issues for it while you report; add evidence to an existing issue, or offer to
  file one with the symptom & a root-cause guess. The user decides whether to proceed around it.

## Session economy

- One concern per session: one issue & one PR-sized deliverable. The project default is to stop at
  the first context compaction, harness usage/context warning, or usage-window end; explicit user or
  harness lifecycle instructions take precedence. These are not request counts. Approaching limits,
  write a worktree or issue handoff note, then stop.
- Handoffs give the branch, issue number, & optional `HANDOFF.md` for state absent from commits or
  issues. Do not paste narratives. Reconstruct context with `gh issue view`, `git log`, &
  `git diff`.
- Use Read `offset` & `limit` for needed sections. Never read `src/lib/data/tracker-data.json`; read
  the types or pipeline source. Do not reread context already present; after compression, reread
  only the needed section.
- Route once at session start to the cheapest capable model; reevaluate only for unexpected
  complexity. Model tiers, names, & switching commands live solely in
  [DELEGATION.md](.agents/DELEGATION.md); do not pin a model in repository harness settings.
