---
id: 2026-10-06-utils-layering
status: needs-review
summary: >-
  `utils/` holds only low-level helpers that any layer may import. The rest moved to layers named
  for what they do: `sources/` (source text rendering), `controllers/` (rune controllers),
  `effects/` (confetti & the undo toast), & `test-utils/` (test-only helpers & harnesses). An oxlint
  `no-restricted-imports` override on `src/lib/utils/` rejects imports from `components`, `stores`,
  `controllers`, `effects`, `sources`, `pwa`, & `presentation`, and `tests/lint-ownership.test.ts`
  probes it.
review: >-
  Does this decision still apply unchanged? Its owning implementation & later resolutions were not
  revalidated while seeding issue #268.
evidence:
  - docs/decisions/2026-10-06-utils-layering.md#decision
relationships: []
---

# `utils/` is the bottom layer

## Context

`src/lib/utils/` had become the default destination for new code. It held domain rendering
(`source-segments.ts` & friends), rune controllers, UI side effects, & test-only helpers, so modules
there imported stores and other app layers while the engine & pipeline imported utils
([mrh-is/mistria-fyi-private#459](https://github.com/mrh-is/mistria-fyi-private/issues/459), part of
[mrh-is/mistria-fyi-private#374](https://github.com/mrh-is/mistria-fyi-private/issues/374)).

## Decision

`utils/` holds only low-level helpers that any layer may import. The rest moved to layers named for
what they do: `sources/` (source text rendering), `controllers/` (rune controllers), `effects/`
(confetti & the undo toast), & `test-utils/` (test-only helpers & harnesses). An oxlint
`no-restricted-imports` override on `src/lib/utils/**` rejects imports from `components`, `stores`,
`controllers`, `effects`, `sources`, `pwa`, & `presentation`, and `tests/lint-ownership.test.ts`
probes it.

## Alternatives

- **Keep a flat `utils/` and lint only against components & stores.** Rejected: the lint alone
  doesn't stop domain code from piling up there, and the moved modules would have failed it anyway.
- **Put `celebrate.ts` & `undo-toast.ts` in `controllers/`.** Rejected: they're stateless
  fire-and-forget calls, not controllers a component instantiates.
- **Require utils to be dependency-free.** Rejected for now: `format.ts` & `localized-href.ts` need
  Paraglide and generated data, and splitting them would churn every call site for little gain.

## Revisit if

- A utils helper needs one of the restricted layers; that's a sign it belongs in that layer.
- `utils/` grows past a dozen modules or starts collecting domain logic again.
