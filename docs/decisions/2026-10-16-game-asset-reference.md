# Game asset reference

## Context

Agents re-explored the extracted game files under `pipeline/input/vX.Y.Z/assets/` from scratch each
session. The app & pipeline were well documented, but nothing mapped the assets themselves: about
2,260 files in v1.0.8, of which the pipeline names roughly 55 fiddle paths. A reference had to stay
accurate across game releases without anyone re-reading every file each time.

## Decision

1. **Public placement.** The reference lives in the public repository as
   [docs/game-asset-format.md](../game-asset-format.md), beside the save-file format it parallels.
   It describes structure, naming, ID conventions, & quirks with short illustrative snippets, never
   bulk game data, and the takedown procedure removes it with the pipeline.
2. **Script plus short prose.** `pnpm run pipeline:atlas` (`pipeline/src/atlas/`) owns the
   inventory: every file, each fiddle root’s keys & shape summary, and the pipeline modules that
   reference it. Its output goes to the ignored `pipeline/output/asset-atlas/`. The document holds
   only what tooling can’t express: meaning, conventions, quirks, & leads.
3. **Per-version diffing.** `--compare=X.Y.Z` reports files, fiddle roots, & keys added, removed, or
   reshaped between two releases. A new release updates the document only where the diff shows a
   structural change, rather than prompting a fresh survey.

## Alternatives

A private reference (in `mistria-fyi-private` or local agent memory) would keep the content posture
simplest, but structural documentation discloses no more than the public pipeline already does, and
a private copy is invisible to contributors & cloud agents. A fully prose reference reads well but
decays silently with each release. Committing the generated atlas would make it reviewable, but its
per-key listing approaches bulk game data and would churn with every release. Re-surveying each
release with subagents is slow, nondeterministic, & downloads every file from the online-only Drive
folder.

## Revisit if

Revisit this decision if a rights holder objects to structural documentation, the pipeline starts
parsing GML or Tiled data (which would warrant shape summaries for those folders too), or the static
claim scan starts missing references often enough that an explicit claims registry pays off.
