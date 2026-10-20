# Agent task workflow

Read the relevant heading before issue work, commits, or GitHub delivery. Use
[development-workflow.md](development-workflow.md) for setup mechanics & troubleshooting. Existing
clear acceptance criteria authorize implementation; do not reconfirm the session checklist.

## Git identity

Commit as the human who owns the checkout; agents add a co-author trailer (below) rather than
changing the author. Unsigned agent commits are acceptable where the owner’s signing key is absent,
such as cloud sandboxes, and the platform’s own commit identity may sign instead. Never copy a
private key into a sandbox to make signing work.

## Agent attribution

Agent attribution is mandatory for agent-authored Git and GitHub content:

- Keep the repository owner’s configured identity as the commit author. Add the agent’s standard
  `Co-Authored-By` trailer to every commit the agent materially authored. Use a stable product-level
  identity rather than changing the trailer with each model version; for example,
  `Co-Authored-By: Claude Code <noreply@anthropic.com>` or
  `Co-Authored-By: Codex <codex@openai.com>`.
- Add a final `Agent: <agent-id>` line to every agent-authored issue or PR body. Use `claude-code`
  for Claude Code, `codex` for Codex, and a stable lowercase product slug for another agent.
- Add exactly one matching `agent:*` label to every agent-authored PR. When an agent files an issue,
  include the `Agent:` attribution line; an `agent:*` label on an issue marks active ownership, not
  authorship. The established labels are `agent: claude`, `agent: codex`, `agent: antigravity`,
  `agent: kilo`, `agent: copilot`, and `agent: lm studio`; do not create a parallel `agent/...`
  label family.
- End every substantive agent-authored GitHub comment with the same `Agent: <agent-id>` line. This
  remains required when an issue or PR already has an agent label because multiple agents may
  participate in one thread.
- For multiline GitHub CLI issue or PR bodies, pass a file or stdin with literal line breaks (for
  example, `gh issue edit --body-file -`). Do not embed escaped `\\n` sequences in `--body`; GitHub
  renders them literally. Re-read the published body after creating or editing it.
- Checks: a `commit-msg` hook rejects drifted trailers locally, and the “Attribution” workflow
  checks a PR’s own commits (final trailer block only), its final `Agent:` line, & its single
  `agent:*` label (human-only PRs pass). The workflow blocks a merge only once the main ruleset
  lists “Attribution” as a required check. A harness reminder may inject model-versioned text;
  correct it before committing.
- Preserve existing attribution during edits and handoffs. Trailers and `Agent:` lines identify who
  authored each artifact.

## Task sequence

1. **Read the issue & comments**; use `gh issue view <number> --json title,body,labels,comments`.
   The `--comments` flag produces empty output when there are no comments; `--json` is reliable in
   all cases. Do not start issues labeled `status: blocked` or `status: needs decision`. If an issue
   has `status: in progress` or an `agent:*` label, coordinate with its current owner rather than
   starting duplicate work.
2. **Resolve uncertainties before starting.** If the issue already has clear acceptance criteria,
   proceed without asking for approval again. Ask the user only about unresolved scope, conflicting
   requirements, or decisions the existing criteria do not settle.
3. **Scope the change**; identify the affected subsystem, acceptance criteria, & deliverables. For
   nontrivial features without clear acceptance criteria, write a short acceptance checklist (3–7
   items describing the states the finished feature must satisfy) & get user approval before
   implementing. Existing clear acceptance criteria satisfy this gate; do not request a second
   approval or create a duplicate checklist.
4. **Branch**; work on a branch from the refreshed remote tip. A worktree is optional (see
   AGENTS.md, Worktrees).
5. **Baseline**; install dependencies (Node 24 per `.node-version`;
   `pnpm install --frozen-lockfile`) and verify a clean baseline with focused checks, not a full
   suite.
6. **Understand contracts**; read the affected subsystem, its boundaries, and existing tests before
   editing.
7. **Test first**; add or update tests for behavioral changes, preferably before implementation. Run
   focused tests during development (see agent-verification.md).
8. **Verify**; run `pnpm run lint:fix` before committing; CI runs the full matrix (see
   agent-verification.md).
9. **Deliver**; commit with the required co-author trailer, push, and open an attributed PR that
   references the issue (`Closes #N`) and fills in the template’s “Preview” line with the branch
   preview URL, `https://<branch-slug>.mistria-fyi.pages.dev`. Cloudflare’s PR comment with it isn’t
   reliable, so derive the slug from the branch name: lowercase it, replace each non-alphanumeric
   character with `-` (runs aren’t collapsed, so `a/_b` becomes `a--b`), keep the first 28
   characters, then drop a trailing `-` (`worktree-agent-ac94622f1a9ec4708` becomes
   `worktree-agent-ac94622f1a9ec`). Cloudflare documents only the first two steps. A PR that
   regenerates `tracker-data.json` includes `pnpm run data:diff` output in its description: the full
   listing in a collapsed `<details>` block, or its summary line plus the representative changes
   when the listing is long. The script reads the file through Git, so the read guard doesn’t block
   it. Apply the matching `agent:*` label to the PR. **Draft vs. ready:** the maintainer merges PRs
   that pass CI, so an open PR’s state is the agent’s merge recommendation. Open the PR as a draft
   (`gh pr create --draft`) whenever anything still stands between it and merging: an unfinished
   manual step (an upload, a login, a data regeneration), an unanswered question, a known gap, or a
   pending review. Mark it ready (`gh pr ready`) only once you’d merge it yourself, and convert it
   back (`gh pr ready --undo`) if that changes. Production builds derive their application version
   from deterministic Git commit metadata. Treat `package.json`’s version and Git version tags as
   intentional product-release metadata: do not change or create them unless the task explicitly
   cuts a release, and ask the user to approve the release version first.
10. **Monitor CI**; after opening the PR, watch its checks so CI failures are caught and fixed
    without requiring the user to relay status. Use whatever the harness offers for PR monitoring
    (for example, the Claude Code desktop app’s `ccd_pr` `bind_pr` & `set_monitor` tools), or check
    `gh pr checks` periodically. GitHub sometimes never starts CI for a PR’s `opened` event; if no
    “CI” run exists for the head commit a few minutes after opening, push an empty commit (see
    [docs/development-workflow.md](development-workflow.md#ci-doesnt-start-on-a-new-pr)).

## Evidence attachments

- Attach screenshots with GitHub CLI’s `--attach` flag, referencing each file in the body above the
  final `Agent:` line (otherwise the image lands after it and fails Attribution). Include useful
  prototype code in a collapsed `<details>` element. See the
  [development workflow](development-workflow.md#attach-visual-evidence--prototype-code) for the
  exact syntax and examples.
