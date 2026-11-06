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

Commit trailers are the durable record of agent authorship. Squash merges preserve them on `main`.
Use the PR body for the change summary, verification, & decisions.

- **Commits:** keep the repository owner’s configured identity as the commit author. Add the agent’s
  standard `Co-Authored-By` trailer to every commit the agent materially wrote. Use a stable
  product-level identity that doesn’t change with each model version, for example:
  - `Co-Authored-By: Claude Code <noreply@anthropic.com>`
  - `Co-Authored-By: Codex <codex@openai.com>`
- **Issues:** end the body with `Agent: <agent-id>`. Use `claude-code` for Claude Code, `codex` for
  Codex, & a stable lowercase product slug for any other agent. Include exactly one `type:` label,
  exactly one `status:` label, an `area:` label when one fits, a milestone, & an “Acceptance
  criteria” section (or a “Done when” line for investigations). Use the
  [task](../.github/ISSUE_TEMPLATE/task.md) or [bug](../.github/ISSUE_TEMPLATE/bug.md) template.
  With `gh issue create --body-file`, pass labels & the milestone explicitly through `--label` &
  `--milestone`; template defaults don't apply. List current milestones with
  `gh api repos/mrh-is/mistria-fyi/milestones --jq '.[].title'`. Use the issue’s `agent:*` label to
  identify its active agent.
- **Issue & PR assignees:** when taking on work, assign the issue & its PR to the GitHub user you
  represent. Check the authenticated account with `gh api user --jq .login`; use
  `gh issue edit <number> --add-assignee @me` & `gh pr edit <number> --add-assignee @me`, or
  `--assignee @me` when creating a PR. The assignee identifies the human responsible. Keep
  assignments current when handing work off.
- **Comments:** end every substantive agent-authored GitHub comment with an `Agent:` line to
  identify its author when several agents take part in one thread.
- **Multiline bodies:** pass a file or stdin with literal line breaks, for example
  `gh issue edit --body-file -`. Don’t embed escaped `\\n` sequences in `--body`, which GitHub
  renders literally. Re-read the published body after creating or editing it.
- **Edits & handoffs:** keep existing attribution. Trailers & `Agent:` lines record who wrote each
  piece.

## Task sequence

1. **Read the issue & resolve open questions.** Follow [Task scope](../AGENTS.md#task-scope). Add
   `assignees` to the `gh issue view` fields, since an assignee also means the issue has an owner.
2. **Scope the change.** A nontrivial feature without clear acceptance criteria needs three to seven
   acceptance items, each describing a state the finished feature must satisfy.
3. **Assign the issue** to the GitHub user you represent (see “Issue & PR assignees” above).
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
9. **Deliver.** Commit with the required co-author trailer, push, & open a PR. The PR needs:
   - a reference to the issue: `Closes #N`, or `Refs #N` when the issue needs work after the merge
     (see “Final state” below),
   - a deployment or branch preview URL when available (see “Preview URL” below),
   - `data:diff` output, if the PR regenerates tracker data (see “Tracker data changes” below),
   - the GitHub user you represent as its assignee (`--assignee @me`).

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

### Friction log

The pinned “Agent friction log” issue collects small frictions that agents work around without being
blocked. One issue covers each month. Find the current one with
`gh issue list --search "Agent friction log in:title" --state open`.

- **What goes there:** a flaky command, a stale or confusing doc, a guard that blocked a harmless
  command, or any other workaround that didn’t stop the task. Product bugs, blockers, & deferred
  review findings still get their own issues.
- **Borderline cases:** a test that fails & then passes on a rerun is friction. It becomes an issue
  when it fails again on rerun, or when it blocks a merge. A stale doc you didn’t fix is friction,
  unless following it would break something; then it’s a bug.
- **Format:** one comment per friction, with “What”, “Workaround”, “Where”, & “Task” lines and the
  `Agent:` line. The log issue’s body has an example.
- **Repeats:** log a friction again even when someone already has. The repeat count is the signal.
- **Monthly review:** when the month ends, the owner (or an agent the owner asks) tallies the
  comments. Anything logged about three times becomes an issue, linked from the tally. The tally is
  the old log’s closing comment, and a new log issue replaces it.

## Recording decisions

Each kind of “why” has one home. Pick the narrowest one that fits:

1. **PR “Decisions” section:** the default. List each choice the change made & its reason, one line
   each, or “None”. It’s tied to the diff, and `git blame` leads back to it.
2. **Code comment:** when the code would look wrong, or tempt a cleanup, without the reason next to
   it.
3. **Living docs** such as [sync.md](sync.md) & [app-architecture.md](app-architecture.md): the
   current design. Edit them in place when the design changes; don’t append a history.
4. **Decision record** in `docs/decisions/`: only when a capable newcomer would propose the rejected
   alternative, so the record’s “Revisit if” section stops the question from being reopened.
   Save-driven sync with no logins is the model case. Expect a handful a year. A record is plain
   Markdown with Context, Decision, Alternatives, & Revisit if sections, and no metadata header.

Most changes need only the first. A decision record that would merely log a choice belongs in the PR
instead. See [the decision on decision records](decisions/2026-11-02-agents-report-less.md).

## Docs sweep

Docs drift between sweeps, so repeat this one when agent guidance has grown noticeably or during a
project review. File it as one issue, with the findings as its acceptance criteria.

1. **Find repeated rules.** Compare `AGENTS.md`, `docs/agent-*.md`, &
   `docs/development-workflow.md`. Each procedural rule keeps one home, and other mentions link to
   it.
2. **Check references.** Look for closed issues described as tracking something, private issues no
   reader can open, renamed headings, & moved paths.
3. **Replace copies with links.** A number, a string, or a list copied from code goes stale. Point
   to the constant or the file instead. For example, `docs/sync-setup.md` names `messages/en.json`
   instead of repeating its text.
4. **Compare docs with their tools.** A command in a doc should match what the tool expects, such as
   `scripts/machine-doctor.ts` for browser installs.
5. **Remove what nothing uses.** Search for inbound links to each doc. Delete a doc with none unless
   a reader would still look for it, because Git history keeps the old text.
6. **Verify.** Run `pnpm exec vitest run --project node tests/doc-paths.test.ts`, then the docs-only
   checks.

## Pull request details

### Preview URL

Use the Cloudflare Pages deployment link when GitHub shows it. Otherwise, fill in the PR template’s
“Preview” line with the branch alias at `https://<branch-slug>.mistria-fyi.pages.dev`. Derive the
slug from the branch name:

1. Lowercase it.
2. Replace each non-alphanumeric character with `-`. Runs aren’t collapsed, so `a/_b` becomes
   `a--b`.
3. Keep the first 28 characters.
4. Trim trailing hyphens.

For example, `worktree-agent-ac94622f1a9ec4708` becomes `worktree-agent-ac94622f1a9ec`. Cloudflare
documents only the first two steps. Omit the preview link when no preview is available.

### Tracker data changes

A PR that regenerates `tracker-data.json` includes `pnpm run data:diff` output in its description.
Put the full listing in a collapsed `<details>` block. When the listing is long, include its summary
line & the representative changes instead.

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

### Final state

“Ready” means ready to merge, so cleanup happens before a PR is marked ready. The maintainer merges
on GitHub, and an agent may get no moment to fix anything afterward.

- **PR body:** before `gh pr ready`, rewrite the body so it describes the final state of the change.
  Remove anything that only held true while the work was in progress, such as “the PR remains a
  draft” or a request for a check that has since finished.
- **Post-merge work:** when an issue’s acceptance criteria include anything that can happen only
  after the merge, such as a production check, reference that issue with `Refs #N`, not `Closes #N`.
  `Closes` would close the issue with the item still unchecked. Whoever finishes the item closes the
  issue.

### Release versions

Production builds derive their application version from Git commit metadata, which is deterministic.
`package.json`’s version & Git version tags are intentional product-release metadata. Don’t change
or create them unless the task explicitly cuts a release, and ask the user to approve the release
version first.

## Evidence attachments

- A PR under the visual review gate must attach its verification screenshots; attaching isn’t
  optional. When the change alters existing UI, prefer a before & after pair of the same state. A PR
  that meets a [visual exemption](agent-verification.md#visual-exemptions) attaches none.
- Attach screenshots with GitHub CLI’s `--attach` flag. Reference each file where it belongs in the
  body.
- Put useful prototype code in a collapsed `<details>` element.
- The [development workflow](development-workflow.md#attach-visual-evidence--prototype-code) has the
  exact syntax & examples.
