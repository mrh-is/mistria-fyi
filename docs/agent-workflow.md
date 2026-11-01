# Agent task workflow

Read the relevant heading before issue work, commits, or GitHub delivery. Setup mechanics &
troubleshooting live in [development-workflow.md](development-workflow.md). Clear existing
acceptance criteria already authorize the implementation, so don’t reconfirm the session checklist.

## Git identity

Commit as the person who owns the checkout. An agent adds a co-author trailer (see below) instead of
changing the author.

Agent commits may be unsigned where the owner’s signing key is absent, such as in a cloud sandbox.
There, the platform’s own commit identity may sign instead. Never copy a private key into a sandbox
to make signing work.

## Agent attribution

Agent-authored Git & GitHub content must say which agent wrote it.

- **Commits:** keep the repository owner’s configured identity as the commit author. Add the agent’s
  standard `Co-Authored-By` trailer to every commit the agent materially wrote. Use a stable
  product-level identity that doesn’t change with each model version, for example:
  - `Co-Authored-By: Claude Code <noreply@anthropic.com>`
  - `Co-Authored-By: Codex <codex@openai.com>`
- **Issue & PR bodies:** end every agent-authored body with an `Agent: <agent-id>` line. The ID is
  `claude-code` for Claude Code, `codex` for Codex, and a stable lowercase product slug for any
  other agent.
- **PR labels:** give every agent-authored PR exactly one matching `agent:*` label. The established
  labels are `agent: claude`, `agent: codex`, `agent: antigravity`, `agent: kilo`, `agent: copilot`,
  & `agent: lm studio`. Don’t create a parallel `agent/...` label family.
- **Issues:** an agent that files an issue includes the `Agent:` line. An `agent:*` label on an
  issue marks who is working on it now, not who wrote it.
- **Comments:** end every substantive agent-authored GitHub comment with the same `Agent:` line.
  This still applies when the issue or PR already has an agent label, because several agents may
  take part in one thread.
- **Multiline bodies:** pass a file or stdin with literal line breaks, for example
  `gh issue edit --body-file -`. Don’t embed escaped `\\n` sequences in `--body`, which GitHub
  renders literally. Re-read the published body after creating or editing it.
- **Edits & handoffs:** keep existing attribution. Trailers & `Agent:` lines record who wrote each
  piece.

### Attribution checks

These checks enforce the rules above:

- A `commit-msg` hook rejects a drifted trailer locally, such as one that names a model version
  instead of the product.
- The “Attribution” workflow checks four things on a PR:
  - the PR’s own commits (the final trailer block only),
  - its final `Agent:` line,
  - its single `agent:*` label,
  - its `Preview:` line, against `previewSlug` in `scripts/check-attribution.ts`.

  Human-only PRs pass: those with no agent trailer, `Agent:` line, or `agent:*` label.

- The “Guarded paths” workflow requires `data:diff` output in a PR that changes the tracker data.
- `pnpm run lint` requires a `-- reason` on every oxlint & ESLint disable directive.

“Attribution” blocks a merge only once the main branch’s ruleset lists it as a required check. A
harness reminder may inject model-versioned trailer text; correct it before committing.

## Task sequence

1. **Read the issue, comments, & relationships.** Use
   `gh issue view <number> --json title,body,labels,comments,blockedBy,parent`. The `--comments`
   flag prints nothing when there are no comments, while `--json` works in every case. Don’t start
   an issue that an open issue blocks (see “Blockers” below), or one labeled `status: blocked` or
   `status: needs decision`. If an issue has `status: in progress` or an `agent:*` label, coordinate
   with its current owner instead of duplicating the work.
2. **Resolve open questions before starting.** If the issue already has clear acceptance criteria,
   go ahead without asking for approval again. Ask the user only about scope the criteria leave
   open, requirements that conflict, or decisions the criteria don’t settle.
3. **Scope the change.** Identify the subsystem it affects, its acceptance criteria, & its
   deliverables. A nontrivial feature without clear acceptance criteria needs a short acceptance
   checklist: three to seven items, each describing a state the finished feature must satisfy. Get
   the user’s approval of that checklist before implementing. Clear existing criteria count as the
   approval, so don’t ask a second time or write a duplicate checklist.
4. **Branch.** Work on a branch cut from the freshly fetched remote tip. A worktree is optional (see
   “Worktrees” in AGENTS.md).
5. **Check the baseline.** Install dependencies with `pnpm install --frozen-lockfile`, which also
   supplies the Node version in `.node-version`. You may run it without further approval when
   project dependencies are missing or stale. Use the configured external store, and leave the
   lockfile unchanged. If the install fails, report it under “Tooling failures” in AGENTS.md. Then
   confirm a clean baseline with focused checks, not a full suite.
6. **Understand the contracts.** Before editing, read the affected subsystem, its boundaries, & its
   existing tests.
7. **Test first.** Add or update tests when behavior changes, ideally before the implementation. Run
   focused tests during development (see agent-verification.md).
8. **Verify.** Run `pnpm run lint:fix` before committing. CI runs the full matrix (see
   agent-verification.md).
9. **Deliver.** Commit with the required co-author trailer, push, & open an attributed PR. The PR
   needs:
   - a reference to the issue (`Closes #N`),
   - the branch preview URL on the template’s “Preview” line (see “Preview URL” below),
   - `data:diff` output, if the PR regenerates tracker data (see “Tracker data changes” below),
   - the matching `agent:*` label.

   Open it as a draft or as ready according to “Draft or ready” below.

10. **Monitor CI.** After opening the PR, watch its checks, so you catch & fix CI failures without
    the user relaying them. Use whatever PR monitoring the harness offers, such as the `ccd_pr`
    tools `bind_pr` & `set_monitor` in the Claude Code desktop app. Otherwise, run `gh pr checks`
    periodically. GitHub sometimes never starts CI for a PR’s `opened` event. If no “CI” run exists
    for the head commit a few minutes after opening, push an empty commit (see
    [docs/development-workflow.md](development-workflow.md#ci-doesnt-start-on-a-new-pr)).

## Issue triage

### Blockers

A dependency on another issue is a “blocked by” relationship, not a label. GitHub then shows the
blocker on both issues and clears it when the blocker closes, so the dependency can’t go stale.

- **Add:** `gh issue edit <number> --add-blocked-by <other>`, or
  `gh issue create --blocked-by <other>` when filing.
- **Read:** `gh issue view <number> --json blockedBy` lists each blocker & its state. An issue is
  blocked while any of them is open.
- **Remove:** `gh issue edit <number> --remove-blocked-by <other>` when the dependency no longer
  applies.

`status: blocked` is only for blockers outside the tracker, such as waiting on a game release,
hardware, or a third party. Name the blocker & what would clear it in a comment. An issue blocked
only by other issues keeps its other status, usually `status: ready`.

### Small-agent tasks

The `delegate: small agent` label marks an issue that Antigravity or Copilot can finish without
judgment calls. It describes the task’s fit, not who owns it, so the usual `status:*` & `agent:*`
claiming rules still apply. Claude & Codex add it, unprompted, to any issue they file or triage that
meets every condition below:

- **Specified:** the body names the files to change, and the acceptance criteria are checkable
  states, not goals.
- **Verified by a command:** the body gives the focused test or check that proves it’s done, such as
  `pnpm exec vitest run src/lib/engine/foo.test.ts`.
- **Bounded:** the body says when to stop & report instead of continuing. Typical stop points are a
  needed change to an unlisted file, a failing check that the task didn’t cause, or an acceptance
  item that can’t be met as written.
- **Low risk:** it avoids the high-risk surfaces in
  [agent-verification.md](agent-verification.md#high-risk-surfaces), dependency changes, & design
  judgment, such as new visual direction or English copy.

To delegate one piece of a larger issue, file that piece as a sub-issue
(`gh issue create --parent <number>`) that meets the conditions on its own, and label the sub-issue,
not the parent. When pieces must land in order, link them with “blocked by” relationships. Remove
the label if the task grows past these conditions.

## Pull request details

### Preview URL

Each branch gets a preview at `https://<branch-slug>.mistria-fyi.pages.dev`. Cloudflare’s PR comment
with this URL isn’t reliable, so derive the slug from the branch name yourself:

1. Lowercase it.
2. Replace each non-alphanumeric character with `-`. Runs aren’t collapsed, so `a/_b` becomes
   `a--b`.
3. Keep the first 28 characters.
4. Drop a trailing `-`.

For example, `worktree-agent-ac94622f1a9ec4708` becomes `worktree-agent-ac94622f1a9ec`. Cloudflare
documents only the first two steps.

### Tracker data changes

A PR that regenerates `tracker-data.json` includes `pnpm run data:diff` output in its description.
Put the full listing in a collapsed `<details>` block. When the listing is long, include its summary
line & the representative changes instead. The script reads the file through Git, so the read guard
doesn’t block it.

### Draft or ready

The maintainer merges PRs that pass CI, so an open PR’s state is the agent’s merge recommendation.
Open the PR as a draft (`gh pr create --draft`) whenever anything still stands between it and
merging:

- an unfinished manual step, such as an upload, a login, or a data regeneration,
- an unanswered question,
- a known gap,
- a pending review.

Mark it ready (`gh pr ready`) only once you’d merge it yourself. If that changes, convert it back
with `gh pr ready --undo`.

### Release versions

Production builds derive their application version from Git commit metadata, which is deterministic.
`package.json`’s version & Git version tags are intentional product-release metadata. Don’t change
or create them unless the task explicitly cuts a release, and ask the user to approve the release
version first.

## Evidence attachments

- A PR under the visual review gate must attach its verification screenshots; attaching isn’t
  optional. When the change alters existing UI, prefer a before & after pair of the same state.
- Attach screenshots with GitHub CLI’s `--attach` flag. Reference each file in the body above the
  final `Agent:` line. Otherwise, the image lands after that line, and the Attribution check fails.
- Put useful prototype code in a collapsed `<details>` element.
- The [development workflow](development-workflow.md#attach-visual-evidence--prototype-code) has the
  exact syntax & examples.
