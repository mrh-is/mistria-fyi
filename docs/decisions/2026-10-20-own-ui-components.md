---
id: 2026-10-20-own-ui-components
status: needs-review
summary: >-
  Historical scope: Own the ui components. Current applicability is unverified.
review: >-
  Does this decision still apply unchanged? Its owning implementation & later resolutions were not
  revalidated while seeding issue #268.
evidence:
  - docs/decisions/2026-10-20-own-ui-components.md#decision
relationships: []
---

# Own the ui components

## Context

`src/lib/components/ui/` began as shadcn-svelte output, but the project forked it (touch targets,
motion, color, a custom switch, typography). The rule “edit only through the shadcn CLI, in a PR
labeled `shadcn-update`” would revert the touch-target accessibility fix on any regeneration, and no
`shadcn-update` PR has ever happened. The hook, the “Guarded paths” check, & CODEOWNERS all enforced
a workflow nobody follows.

## Decision

- **`ui/` is project-owned.** Edit it directly. The edit hook, `check-guarded-paths`, & CODEOWNERS
  no longer cover it; the generated-data guard for `src/lib/data/tracker-data.json` is unchanged.
- **The MIT notice stays.** `THIRD-PARTY-NOTICES.md` carries shadcn-svelte’s license text.
- **The shadcn utils boundary test is retired.** It existed to keep the pipeline from importing the
  shadcn-shaped `#lib/utils.js`; the comment in `src/lib/utils.ts` keeps the warning.
- **The `shadcn-update` label is no longer required.** Nothing in the repository checks it; the
  maintainer retires or redescribes the label itself when this merges.
- **Contrast & axe tests stay.** They are what protects the forked components now.
- **Lint, format, & CSS exemptions for `ui/` stay, on purpose.** The oxlint import-style
  relaxations, the oxfmt scope, the ESLint rules that skip `ui/` (hardcoded text, untokened
  classes), & the Stylelint exemption still match how the forked files are written. Owning the code
  does not mean rewriting it to the app’s template rules in the same change; that is a separate
  cleanup.
- **The hook guard is exact-file only.** With the directory guard gone, `guard-generated-paths.ts`
  matches only `src/lib/data/tracker-data.json`; directory-level or `cd`-relative writes that reach
  it are caught by the “Guarded paths” CI check, not the hook.
- **Unused components await deletion.** `badge`, `card`, & `progress` have no importers; the session
  that made this change could not delete them (its edit hook still guarded `ui/`), so Knip ignores
  them until a follow-up removes them.

## Alternatives

- Keep the guard & regenerate on a schedule: rejected, since regeneration would overwrite the fork’s
  accessibility fixes.
- Keep CODEOWNERS review on `ui/`: rejected, since owner review of every component change is the
  same friction without the vendoring rationale.

## Revisit if

The project starts taking upstream shadcn-svelte updates again (a `shadcn-svelte` CLI sync), or
`ui/` grows large enough to deserve its own review rules, or the exemptions above start hiding real
defects in `ui/` (then bring the components up to the app’s lint, format, & CSS rules).
