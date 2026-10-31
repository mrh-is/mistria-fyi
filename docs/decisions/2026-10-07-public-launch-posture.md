---
id: 2026-10-07-public-launch-posture
status: amended
summary: >-
  The takedown-ready posture gained a precise allowance for independently removable, coarse farm
  geometry.
review: >-
  NPC Studio correspondence & current permission were not independently rechecked; this index infers
  no response.
evidence:
  - docs/decisions/2026-10-20-farm-planner-geometry.md
relationships:
  - type: amended-by
    target: 2026-10-20-farm-planner-geometry
    scope: partial
    portion: >-
      Only the boundary for derived farm geometry beyond sprites & the factual dataset. Launch
      history & takedown posture keep their original scope.
    evidence:
      - docs/decisions/2026-10-20-farm-planner-geometry.md
---

# Public launch posture & takedown readiness

Amended by [the farm planner geometry decision](2026-10-20-farm-planner-geometry.md).

## Context

Making the repository public
([mrh-is/mistria-fyi-private#218](https://github.com/mrh-is/mistria-fyi-private/issues/218))
included asking NPC Studio for permission to publish game-derived material: the sprites, the
generated dataset, & the extraction pipeline. NPC Studio hasn’t replied. On 2026-10-07 the
maintainer decided to launch anyway rather than block on the reply, on the condition that any part
can be withdrawn quickly if NPC Studio objects. The same day, the maintainer sent NPC Studio a
follow-up
([mrh-is/mistria-fyi-private#665](https://github.com/mrh-is/mistria-fyi-private/issues/665))
announcing the launch date & listing what the public repository will contain.

Separately, the current repository’s history contains `static/sprites/` (added in `9390ae1`) and a
personal filesystem path in the since-removed `measure-transfer-size.ts`. Neither should become
public.

## Decision

- **Launch date: 2026-10-12.** This leaves NPC Studio five days to answer the follow-up before
  launch, and it leaves time to finish the remaining launch work.
- **Launch posture: everything, takedown-ready.** Publish the project source, the `pipeline/`
  extraction code, & the generated `tracker-data.json`. Keep serving sprites from
  `assets.mistria.fyi`. If NPC Studio objects to any part, comply promptly by following
  [the takedown procedure](../takedown.md): block & delete the sprites (the UI falls back to
  placeholders), remove the dataset or pipeline, or take the repository private.
- **Publication path: a clean repository with filtered history.** Build a new public repository from
  `git filter-repo` output that strips `static/sprites/` and the personal path in
  `measure-transfer-size.ts`. Rename this repository to a private archive and transfer its open
  issues to the new one.
- **Historical references: mapped links or private-beta text.** Rewrite known private issue/PR
  references in commit messages, & this repository’s issue/PR URLs in file contents. Transferred
  issues retain links through an explicit old-to-new mapping; other references become non-linking
  text, preventing GitHub from linking old numbers to unrelated public issues. Reject source tips
  containing either excluded path; the tip tree changes only through URL reference rewrites. The
  [candidate procedure](https://github.com/mrh-is/mistria-fyi/blob/e4dd053a/docs/public-repo.md)
  retains a per-reference report for review & requires the filtered tip to pass the full read-only
  verification matrix before publication. Rewrites include text in source & test fixtures, so
  checking only the private source is insufficient; tracked candidate files must remain unchanged
  after verification.
- **One removal contact:** `michael@mistria.fyi`, in both `DISCLAIMER.md` & the About page.

## Alternatives

- **Wait for NPC Studio’s reply:** rejected; the inquiry has no deadline, and the posture above
  keeps compliance cheap if the answer is no.
- **Launch without sprites or the dataset:** rejected; the tracker is far less useful without
  artwork, and it can’t function without the dataset. Withdrawing either later costs about the same
  as withholding it now.
- **Rewrite this repository’s history in place:** rejected; GitHub retains `refs/pull/*` for every
  past PR, which keeps the sprite blobs reachable, and only GitHub Support can purge them.

## Revisit if

NPC Studio replies (with permission, conditions, or an objection), any rights holder sends a
takedown request, or the project starts distributing material beyond sprites & the factual dataset
(audio, maps, or original game files).
