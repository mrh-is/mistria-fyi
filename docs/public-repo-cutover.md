# Public repo cutover

tl;dr: the public repository takes the name `mrh-is/mistria-fyi`, so almost no repo-identity
reference in code or docs needs to change. What breaks at the cutover is everything bound to the
current repository’s ID: the Cloudflare Pages Git connection, the feedback token, GitHub App
installations, local remotes, and cloud-agent environments. This document inventories each binding,
records the naming decision, and gives the ordered rewiring checklist that #671 links to. Context:
[the launch posture](decisions/2026-10-07-public-launch-posture.md),
[the takedown procedure](takedown.md), #218 (epic), #667 (filtered-history build), & #671 (cutover
runbook).

Inventory taken 2026-10-07 with read-only `gh api` calls and a repo search. Only names are recorded;
no secret values were read. Items marked **Maintainer** need the Cloudflare or GitHub dashboard (or
admin rights the inventory couldn’t exercise) and must be confirmed by a human.

## Naming decision

- The public repository is created as `mrh-is/mistria-fyi`. The current repository is renamed to
  `mrh-is/mistria-fyi-private` first and stays private as the archive.
- **Why this order:** URLs in the app, the README badge, the feedback endpoint, & every external
  link already say `mrh-is/mistria-fyi`. Reusing the name keeps them all valid, and the public
  repository needs no code change for its own identity.
- **Rename-redirect caveat:** after the rename, GitHub redirects `mrh-is/mistria-fyi` (web, git, &
  API) to `mistria-fyi-private`. The redirect lasts only until a new repository claims the old name;
  creating `mrh-is/mistria-fyi` ends it. So the window between runbook steps 3 & 4 must be short,
  and nothing should write to the old name during it (the feedback endpoint would file issues into
  the archive). Never create the new repository before the rename; the name is taken.
- **What follows the ID, not the name:** the Cloudflare Pages Git connection, GitHub App
  installations, existing ruleset IDs, and the `copilot` environment all stay attached to the
  archive after the rename. They don’t move to the new repository by themselves.
- **Old links go stale:** external references to `mrh-is/mistria-fyi/issues/<n>` (PR bodies, chat,
  the NPC Studio follow-up in #665) will resolve to whatever issue holds that number in the public
  repository, or 404. Only the issues approved in #666 are transferred, and they get new numbers.
- **Issue numbers inside the tree:** `#<n>` and `/issues/<n>` references in code & docs (for example
  `pipeline/README.md`, `pipeline/src/overrides/game-facts.ts`, `docs/font-assets.md`) point at
  archive numbers. Rewriting them is #667’s job (mapping file plus rewrite report), not this
  checklist’s.

## Inventory

### GitHub Actions

| Item                    | State                                                                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Actions secrets         | None. Workflows use only the built-in `github.token`.                                                                                                 |
| Actions variables       | None.                                                                                                                                                 |
| Dependabot secrets      | None.                                                                                                                                                 |
| Environments            | `copilot` only, with no protection rules, secrets, or variables.                                                                                      |
| Workflows               | `ci.yml` (PR, push, nightly cron), `attribution.yml`, `guarded-paths.yml`, `game-build-watch.yml` (3-hourly cron; opens issues using `github.token`). |
| Workflow permissions    | Default `read`; Actions can’t approve pull requests; all actions allowed; no SHA pinning.                                                             |
| Fork-PR approval policy | Not settable while private (the API refuses). Set it right after going public.                                                                        |
| Self-hosted runners     | None referenced (`ubuntu-latest` only). **Maintainer:** confirm none are registered.                                                                  |

### Webhooks, apps, & keys

| Item                     | State                                                                                                                                                                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository webhooks      | None.                                                                                                                                                                                                                                                                                             |
| Deploy keys              | None.                                                                                                                                                                                                                                                                                             |
| GitHub App installations | Not visible to the repo-scoped token (the installation endpoint returns 401). **Maintainer:** review `github.com/settings/installations`. Expect the Cloudflare Pages app, Claude, Codex, and (given the `copilot` environment) GitHub Copilot. Note which are scoped to “selected repositories”. |
| Autolinks, Pages         | None. GitHub Pages is not enabled.                                                                                                                                                                                                                                                                |

### Rulesets & protection

- **Ruleset “Protect main”** (ID 13236726, active, targets the default branch, no bypass actors):
  `deletion`, `non_fast_forward`, & `required_status_checks` with contexts `CI passed`,
  `Attribution`, & `Guarded paths` (all `integration_id` 15368, GitHub Actions; non-strict).
- **No classic branch protection** on `main`.
- **CODEOWNERS** (`.github/CODEOWNERS`) routes `src/lib/components/ui/` and
  `src/lib/data/tracker-data.json` to `@mrh-is`. The ruleset has no pull-request rule, so code-owner
  review is not enforced today; CODEOWNERS only requests review. Recreating the ruleset as-is keeps
  that behavior. Whether to enforce it is a separate decision for #671.
- Export for recreation: `gh api repos/mrh-is/mistria-fyi/rulesets/13236726` (use the pre-rename
  name only before step 3; afterward use `mistria-fyi-private`).

### Repository settings

| Setting                          | Value                                                                                                                                                                                                      |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Description                      | “Unofficial completionist tracker for Fields of Mistria”                                                                                                                                                   |
| Homepage                         | `https://mistria.fyi`                                                                                                                                                                                      |
| Topics                           | None.                                                                                                                                                                                                      |
| Features                         | Issues on; Projects, Wiki, Discussions, Pages off.                                                                                                                                                         |
| Merge methods                    | Merge commits only (title: merge message; body: PR title). Squash & rebase off; auto-merge off.                                                                                                            |
| Other                            | Delete branch on merge on; “update branch” button on; web commit sign-off required.                                                                                                                        |
| Default branch                   | `main` (7 branches, 0 open PRs, 28 open issues at inventory time).                                                                                                                                         |
| Dependabot                       | Alerts on; security updates on. `dependabot.yml` zeroes version-update PRs, so it relies on security updates being enabled (see [dependency maintenance](decisions/2026-10-05-dependency-maintenance.md)). |
| Code scanning                    | Not enabled.                                                                                                                                                                                               |
| Private vuln. reporting          | Not enabled (endpoint 404). `SECURITY.md` points reporters to `michael@mistria.fyi` instead.                                                                                                               |
| Secret scanning, push protection | Not reported by the API (`security_and_analysis` is null). **Maintainer:** check Settings → Code security.                                                                                                 |

### Labels

22 labels. Export & clone with `gh label list -L 100 --json name,color,description > labels.json`,
or directly with `gh label clone mrh-is/mistria-fyi-private --repo mrh-is/mistria-fyi`. The labels
are `status: blocked|ready|needs decision|in progress`, `area: pipeline|ui`,
`type: bug|enhancement|maintenance`, `agent: claude|codex`, `user feedback`, `semver: major|minor`,
`requires game install`, `needs game installation`, `dependencies`, `github_actions`, `javascript`,
`shadcn-update`, `generated-data`, & `pre-launch`.

- `user feedback` is applied by the feedback endpoint; it must exist in the new repository or the
  endpoint’s issue creation can fail.
- `shadcn-update` & `generated-data` are required by the “Guarded paths” workflow.
- `agent: *` labels are required by the “Attribution” workflow. AGENTS.md also lists
  `agent: antigravity`, `agent: kilo`, `agent: copilot`, & `agent: lm studio`, which don’t exist
  today; decide whether to create them.
- `pre-launch` becomes obsolete after launch; skip it or delete it afterward.
- The labels must exist in the new repository **before** the issue transfer, or transferred issues
  arrive without them.

### Feedback endpoint

- Code: `src/routes/api/feedback/+server.ts` hardcodes `REPO_OWNER = "mrh-is"` and
  `REPO_NAME = "mistria-fyi"`, posts to `POST /repos/{owner}/{repo}/issues`, and applies the
  `user feedback` label. With the naming decision, **no code change is needed**; the token is what
  must change.
- Cloudflare Pages environment (names only; set in the dashboard, not in the repo):
  `GITHUB_FEEDBACK_TOKEN`, `TURNSTILE_SECRET_KEY`. Binding: KV namespace `FEEDBACK_EMAIL_STORE`,
  declared in `wrangler.toml` (the namespace ID is not secret and travels with the file).
  `.env.example` documents the first two for local development.
- Current token: `.env.example` says classic PAT with `public_repo`. That scope is account-wide for
  every public repository the owner can write to, so revoke it at cutover rather than reuse it. It
  also can’t write to the new repository while it is still private, which is why a fine-grained
  token is needed for the pre-launch verification.
- **Maintainer: confirm the live token.** A classic `public_repo` PAT can’t create issues in a
  private repository, and the current repository is private. So either the live token has broader
  scope (for example `repo`) than `.env.example` documents, or the endpoint can’t file into this
  repository today. Check the token’s scopes on GitHub and the endpoint’s behavior, and correct
  `.env.example` if it’s stale.
- Required replacement: a **fine-grained** personal access token, resource owner `mrh-is`, “Only
  select repositories” limited to the new `mrh-is/mistria-fyi`, repository permission **Issues: Read
  and write** and nothing else (Metadata: read is implied). Give it a short expiry and a calendar
  reminder.
- `.env.example` should then say “fine-grained token, Issues: write on this repository only”; that
  doc edit rides with the cutover PR (or a follow-up), not this inventory.

### Cloudflare

- **Pages project** `mistria-fyi` (named in `wrangler.toml` and `docs/cloud-agent-environments.md`),
  production domain `mistria.fyi`, build output `./build`, Git-connected to `mrh-is/mistria-fyi`
  (inferred). **Maintainer:** confirm in Workers & Pages → `mistria-fyi` → Settings: Git repository,
  production branch, build command & output, environment variables (Production & Preview),
  preview-branch policy, and the custom domains.
- **Open question for the maintainer:** Cloudflare Pages doesn’t offer a “change repository” action
  for an existing Git-connected project. Confirm whether this project can be re-pointed (some
  accounts expose Disconnect then reconnect via the dashboard). If not, the fallback is a new Pages
  project with the same settings, then moving the `mistria.fyi` custom domain and updating
  `CLOUDFLARE_PAGES_PROJECT` in agent environments. Decide before the cutover day, since the
  fallback changes the `*.pages.dev` URL & preview deployments.
- **R2 bucket** `mistria-fyi-assets`, served at `assets.mistria.fyi` (sprites & fonts). Not bound to
  the repository; `scripts/sprites/upload-sprites.ts` uploads with the maintainer’s Wrangler login.
  Unaffected by the cutover. The takedown procedure depends on it.
- **Turnstile** site for the feedback form: not bound to the repo. Unaffected.
- **Cloud-agent Pages read token** (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`):
  account-scoped, not repo-scoped; unaffected, but the environments that hold it are re-pointed
  below.

### Agent environments & local checkouts

- Claude Code on the web & Codex cloud environments are attached to a repository by ID; they need
  re-attaching to the new repository ([cloud-agent-environments.md](cloud-agent-environments.md)).
  Their setup scripts & Cloudflare credentials are unchanged.
- Local checkouts: `origin` is `https://github.com/mrh-is/mistria-fyi.git`. After the rename, the
  old URL redirects to the archive, so existing checkouts silently keep tracking the archive.
  Worktrees (`.worktrees/`, `.claude/worktrees/`) live inside the old checkout.
- `.worktreeinclude` symlinks `pipeline/input/`, `.env`, `.env.*`, & `.dev.vars` from the main
  checkout; a fresh clone needs those carried over by hand (they are gitignored, so they are not in
  the new repository).
- Repo-scoped scripts (`scripts/cleanup-merged-worktrees.sh`, the game-build-watch workflow) use
  `{owner}/{repo}` or `github.repository` and need no change.

### Identity references in the tree

All of these say `mrh-is/mistria-fyi`, which stays correct under the naming decision. Listed so the
post-cutover check can confirm each resolves in the public repository.

| File                                                                                                    | Reference                                                                      |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `README.md`                                                                                             | CI badge & workflow link (`actions/workflows/ci.yml`).                         |
| `CONTRIBUTING.md`                                                                                       | Issues link.                                                                   |
| `src/lib/components/ai-disclosure-dialog.svelte`                                                        | Repository link.                                                               |
| `src/lib/components/feedback-panel.svelte`                                                              | `issues/new` fallback link.                                                    |
| `src/routes/api/feedback/+server.ts`                                                                    | `REPO_OWNER` & `REPO_NAME`.                                                    |
| `src/routes/api/feedback/feedback.test.ts`, `src/lib/components/feedback-panel.isolated.client.test.ts` | Test fixtures asserting the URLs.                                              |
| `.github/CODEOWNERS`                                                                                    | `@mrh-is` owner.                                                               |
| `docs/font-assets.md`, `pipeline/README.md`, `pipeline/src/overrides/game-facts.ts`                     | Links to archive issue numbers (#269, #638); rewritten by #667.                |
| `docs/takedown.md`                                                                                      | `mrh-is/<public-repo>` placeholders; fill in `mistria-fyi` (no change needed). |

Not present: `package.json` has no `repository`, `homepage`, or `bugs` field; there is no
`functions/` directory; the PWA manifest & `src/app.html` contain no repo links.

## Rewiring checklist

Steps follow the #671 runbook (private beta).

Each item slots into the runbook step named in brackets. Run items in order. Every item has a check.
**Maintainer** marks steps only the repository owner can do.

### Before the freeze

- [ ] **Confirm dashboard-only items. Maintainer.** Review the GitHub App installations, self-hosted
      runners, secret scanning & push protection state, and the Cloudflare Pages Git settings listed
      above. Record the answers on #671. _Check:_ every **Maintainer** row in the inventory has a
      recorded answer.
- [ ] **Resolve the Pages re-pointing question. Maintainer.** Decide between reconnecting the
      existing project and creating a new one. _Check:_ the choice is recorded on #671, with the new
      project’s name if applicable.
- [ ] **Confirm the live feedback token’s scope. Maintainer.** See the note under
      [Feedback endpoint](#feedback-endpoint). _Check:_ the answer (broader token, or endpoint
      currently failing) is recorded on #671.

### During the cutover

- [ ] **[Step 3] Rename the archive. Maintainer.**
      `gh repo rename mistria-fyi-private --repo mrh-is/mistria-fyi`. Keep the gap before step 4
      short. _Check:_ `gh repo view mrh-is/mistria-fyi-private --json isPrivate,name` shows the
      archive.
- [ ] **[Step 4] Create the new repository. Maintainer.** Create the empty private
      `mrh-is/mistria-fyi`. _Check:_ `gh repo view mrh-is/mistria-fyi --json isPrivate,createdAt`
      shows the new, empty repository (not a redirect to the archive).
- [ ] **[Step 4] Create the fine-grained feedback token. Maintainer.** It can’t be scoped to the
      repository until it exists. Scope as described under [Feedback endpoint](#feedback-endpoint).
      _Check:_ the token’s settings page shows one repository (`mistria-fyi`), one permission
      (Issues: Read and write), & an expiry date.
- [ ] **[Step 4] Recreate labels first.**
      `gh label clone mrh-is/mistria-fyi-private --repo mrh-is/mistria-fyi`, then trim the labels
      you don’t want (`pre-launch`). _Check:_ `gh label list --repo mrh-is/mistria-fyi` includes
      `user feedback`, `shadcn-update`, `generated-data`, & both `agent:` labels. Do this before the
      issue transfer.
- [ ] **[Step 6] Verify the filtered candidate before pushing.** Follow the
      [candidate verification procedure](public-repo.md#regression-checks), including the full
      read-only matrix & a clean tracked tip. _Check:_ verification exits zero & its output is saved
      with the candidate’s audit reports.
- [ ] **[Step 6] Push the filtered history before enabling the ruleset.** The ruleset’s required
      status checks would reject a direct push to `main`. _Check:_
      `git ls-remote origin refs/heads/main` equals the filter script’s output tip.
- [ ] **[Step 7] Recreate the ruleset.** `POST` the exported “Protect main” definition (drop
      server-set fields such as `id`, `source`, `created_at`) to
      `repos/mrh-is/mistria-fyi/rulesets`. Keep `enforcement: active`, no bypass actors, & the three
      `integration_id` 15368 checks. _Check:_ `gh api repos/mrh-is/mistria-fyi/rulesets` lists
      “Protect main” as active; a test push of a throwaway branch commit to `main` is rejected.
- [ ] **[Step 7] Apply repository settings.** Description & homepage, merge commit only with
      PR-title body, delete branch on merge, update branch, web commit sign-off, Projects/Wiki/
      Discussions off, topics if wanted. _Check:_
      `gh api repos/mrh-is/mistria-fyi --jq '{description,homepage,allow_merge_commit,allow_squash_merge,allow_rebase_merge,delete_branch_on_merge,web_commit_signoff_required}'`
      matches the settings table above.
- [ ] **[Step 7] Actions settings.** Default workflow permissions `read`, Actions can’t approve pull
      requests, all actions allowed. No secrets or variables to recreate. _Check:_
      `gh api repos/mrh-is/mistria-fyi/actions/permissions/workflow` shows `read` & `false`;
      `gh api repos/mrh-is/mistria-fyi/actions/secrets` is empty.
- [ ] **[Step 7] Enable Dependabot alerts & security updates.**
      `gh api -X PUT repos/mrh-is/mistria-fyi/vulnerability-alerts` and
      `gh api -X PUT repos/mrh-is/mistria-fyi/automated-security-fixes`. _Check:_
      `gh api repos/mrh-is/mistria-fyi/automated-security-fixes` returns `"enabled": true`.
- [ ] **[Step 7] Install GitHub Apps on the new repository. Maintainer.** Add only the apps kept
      from the review (Cloudflare Pages if reconnecting, Claude, Codex, Copilot), each scoped to
      selected repositories. _Check:_ `github.com/settings/installations` shows each kept app
      listing `mrh-is/mistria-fyi`; none left on “All repositories” unintentionally.
- [ ] **[Step 7] Reconnect Cloudflare Pages. Maintainer.** Re-point or recreate the project per the
      earlier decision; re-enter production & preview environment variables (`GITHUB_FEEDBACK_TOKEN`
      with the new token, `TURNSTILE_SECRET_KEY`); confirm the `FEEDBACK_EMAIL_STORE` binding comes
      from `wrangler.toml`. While the repository is private, deploy previews work only for the
      connected app. _Check:_ a push to a branch produces a Pages preview deployment from the new
      repository, and `pnpm run cloudflare:logs` (or the dashboard) shows the build’s Git source as
      `mrh-is/mistria-fyi`.
- [ ] **[Step 8] Verify CI.** Open a throwaway PR on the new repository. _Check:_ `CI passed`,
      `Attribution`, & `Guarded paths` all report success and are required (`gh pr checks`);
      `game-build-watch` runs via `workflow_dispatch` and either finds the existing build issue or
      opens one.
- [ ] **[Step 8] Verify the feedback endpoint.** Submit a report from the preview or production site
      with the new token. _Check:_ an issue appears in `mrh-is/mistria-fyi` with the `user feedback`
      label, and **no** issue appears in the archive.
- [ ] **[Step 8] Revoke the old feedback token. Maintainer.** Delete the classic `public_repo` PAT
      once the new one is verified. _Check:_ the old token no longer appears at
      `github.com/settings/tokens`, and the endpoint still files issues.

### After going public

- [ ] **[Step 11] Re-verify the ruleset.** _Check:_
      `gh api repos/mrh-is/mistria-fyi/rulesets --jq '.[] | {name,enforcement}'` still shows
      “Protect main” active; a direct push to `main` is rejected.
- [ ] **[Step 11] Enable secret scanning & push protection. Maintainer.** Settings → Code security.
      _Check:_ `gh api repos/mrh-is/mistria-fyi --jq .security_and_analysis` reports
      `secret_scanning` & `secret_scanning_push_protection` as `enabled`.
- [ ] **[Step 11] Enable private vulnerability reporting.**
      `gh api -X PUT repos/mrh-is/mistria-fyi/private-vulnerability-reporting`, and decide whether
      `SECURITY.md` should mention it alongside the email contact. _Check:_
      `gh api repos/mrh-is/mistria-fyi/private-vulnerability-reporting` returns `"enabled": true`.
- [ ] **[Step 11] Set the fork-PR approval policy.** Require approval for all external contributors
      (`approval_policy: all_external_contributors`, via the
      `actions/permissions/fork-pr-contributor-approval` endpoint, or Settings → Actions → General).
      _Check:_ the GET on the same endpoint returns the chosen policy, and Settings shows “Require
      approval for all external contributors”.
- [ ] **[Step 11] Confirm Dependabot.** _Check:_
      `gh api repos/mrh-is/mistria-fyi/vulnerability-alerts -i` returns `204`, and Settings → Code
      security lists alerts & security updates as enabled.
- [ ] **[Step 11] Confirm the public surface.** _Check:_ the README CI badge renders, the About
      page’s repository link & the feedback panel’s `issues/new` link load, and
      `https://mistria.fyi` still serves the latest production deployment.

### Local & agent environments

- [ ] **[Step 12] Re-point local checkouts.** Keep the old checkout as the archive; clone the new
      repository fresh, then restore the gitignored inputs listed under
      [Agent environments & local checkouts](#agent-environments--local-checkouts) and run
      `pnpm install --frozen-lockfile`. Remove stale `.worktrees/` and `.claude/worktrees/` entries
      from the archive checkout. _Check:_ `gh repo view --json nameWithOwner,createdAt` in the new
      checkout reports the new repository, `ls pipeline/input` lists `assets/` & `save/`, and
      `pnpm run worktree:new` creates a worktree.
- [ ] **[Step 12] Re-attach cloud-agent environments. Maintainer.** Attach the new repository to the
      Claude Code and Codex environments per
      [cloud-agent-environments.md](cloud-agent-environments.md). _Check:_ the verification commands
      in that document pass in a new session for each environment.
- [ ] **[Step 12] Update agent-facing docs if needed.** AGENTS.md mentions issue & PR conventions
      that stay valid; fix any `docs/` text that says the repository is private (for example the
      “private-archive issue” wording in `docs/takedown.md` should name the archive repository).
      _Check:_ `rg -n 'mistria-fyi-private|private archive' docs AGENTS.md README.md` shows only
      intentional mentions.

## Open questions

- Does the existing Pages project support re-pointing (see [Cloudflare](#cloudflare))?
- Which GitHub Apps are installed, and on which repositories?
- What scope does the live `GITHUB_FEEDBACK_TOKEN` have, given a classic `public_repo` token can’t
  file issues in a private repository?
- Is code-owner review meant to be enforced once outside contributors can open PRs?
- Should the missing `agent:` labels from AGENTS.md be created in the new repository?
