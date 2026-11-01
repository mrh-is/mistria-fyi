---
id: 2026-10-12-public-cutover-planning
status: amended
summary: >-
  The Feedback personal-token & rotation plan was replaced by the App transition, whose temporary
  fallback was later removed.
review: >-
  Completion of the one-time Pages & account-scope cutover tasks is not established by this
  authentication reconciliation.
evidence:
  - docs/decisions/2026-10-22-feedback-github-app.md
  - https://github.com/mrh-is/mistria-fyi/pull/243
relationships:
  - type: superseded-by
    target: 2026-10-22-feedback-github-app
    scope: partial
    portion: >-
      Only the Feedback bullet. The other cutover choices are not superseded by this relationship.
    evidence:
      - docs/decisions/2026-10-22-feedback-github-app.md
      - https://github.com/mrh-is/mistria-fyi/pull/243
---

# Public cutover planning

Superseded in part by [2026-10-22-feedback-github-app.md](2026-10-22-feedback-github-app.md): the
feedback endpoint authenticates as a GitHub App, so the token rotation below ends once it ships.

## Context

The final planning interview on launch day, 2026-10-12, addressed the five open questions in the
[cutover plan](https://github.com/mrh-is/mistria-fyi/blob/e4dd053a/docs/public-repo-cutover.md). The
maintainer confirmed a Pages “Disconnect” option, seven GitHub Apps scoped to “All repositories”, &
a working fine-grained feedback token restricted to the current repository. These are
maintainer-reported facts, not independent dashboard checks.

## Decision

- **Pages:** try reconnecting the existing project to the new repository. Repository switching is
  not yet verified. If it fails, decide with the maintainer during cutover whether to create a
  replacement. Do not preselect a replacement name or treat replacement as automatically approved.
- **App scope:** verify Cloudflare & any other demonstrated project dependencies. Leave the
  account-wide audit of Codex, Claude, Cloudflare Workers, Fly.io, ImgBot, Kilo Code, & Vercel
  outside this cutover; installation alone does not establish project use.
- **Feedback:** create a new fine-grained token restricted to the new repository, with Issues: Read
  and write, implied Metadata: read, & a 90-day expiry from creation. Set a rotation reminder &
  revoke the existing token after verifying the replacement.
- **Code-owner review:** retain advisory review requests, without required code-owner approval, to
  keep the maintainer’s workflow simple.
- **Agent labels:** create `agent: antigravity`, `agent: kilo`, `agent: copilot`, &
  `agent: lm studio` to match AGENTS.md. They may remain unused.

## Alternatives

- **Choose a replacement Pages project in advance:** deferred; reconnection may work, & the
  maintainer will decide during cutover if it does not.
- **Audit or restrict every installed app:** outside this cutover’s scope unless project use is
  demonstrated.
- **Retarget or regenerate the existing feedback token:** rejected in favor of a fresh token &
  verification before revocation, with the chosen 90-day lifetime.
- **Require code-owner approval:** rejected because the maintainer prefers less ceremony.
- **Create agent labels only when used:** rejected; creating them now aligns the repository with its
  documented attribution conventions at little cost.

## Revisit if

Pages cannot reconnect, another app proves necessary to this project, feedback permissions or
rotation requirements change, or contributor volume makes enforced code-owner review useful.
