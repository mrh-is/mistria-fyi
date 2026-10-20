# Public cutover planning

## Context

The final planning interview on launch day, 2026-10-12, addressed the five open questions in the
cutover plan (`docs/public-repo-cutover.md`, deleted after the cutover; last present at commit
`4edfb14f`). The maintainer confirmed a Pages “Disconnect” option, seven GitHub Apps scoped to “All
repositories”, & a working fine-grained feedback token restricted to the current repository. These
are maintainer-reported facts, not independent dashboard checks.

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
