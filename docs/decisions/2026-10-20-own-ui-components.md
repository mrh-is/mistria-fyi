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
- **The MIT notice stays.** `THIRD-PARTY-NOTICES.md` carries shadcn-svelte's license text.
- **The shadcn utils boundary test is retired.** It existed to keep the pipeline from importing the
  shadcn-shaped `#lib/utils.js`; the comment in `src/lib/utils.ts` keeps the warning.
- **The `shadcn-update` label is retired.** Its description says so; nothing requires it.
- **Contrast & axe tests stay.** They are what protects the forked components now.

## Alternatives

- Keep the guard & regenerate on a schedule: rejected, since regeneration would overwrite the fork's
  accessibility fixes.
- Keep CODEOWNERS review on `ui/`: rejected, since owner review of every component change is the
  same friction without the vendoring rationale.

## Revisit if

The project starts taking upstream shadcn-svelte updates again (a `shadcn-svelte` CLI sync), or
`ui/` grows large enough to deserve its own review rules.
