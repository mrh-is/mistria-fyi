---
id: 2026-10-20-save-extraction-completeness
status: amended
summary: >-
  Mistmare perks are tracked. Explicit relationship statuses & the Mistmare reveal fact now support
  complete extraction; missing data remains unknown.
review: >-
  Issue 277 rechecks household & Mistmare completeness against both full v1.0.8 saves and the
  serializer. Other extraction details remain outside that audit.
evidence:
  - docs/decisions/2026-10-22-mistmare-perks.md
  - src/lib/engine/untracked-save-ids.ts
relationships:
  - type: amended-by
    target: 2026-10-29-household-save-facts
    scope: partial
    portion: >-
      Relationships & mount appearances can be complete from explicit save facts. The general
      complete/unknown distinction & conservative removal rules remain.
    evidence:
      - docs/decisions/2026-10-29-household-save-facts.md
      - src/lib/engine/import-save.assets.test.ts
  - type: amended-by
    target: 2026-10-22-mistmare-perks
    scope: partial
    portion: >-
      Only the Mistmare perk example in Three classes of ID. The complete/unknown distinction &
      conservative removal rules are not replaced.
    evidence:
      - docs/decisions/2026-10-22-mistmare-perks.md
      - src/lib/engine/untracked-save-ids.ts
---

# Save extraction completeness

## Context

Sync must never remove a fact because a field was missing or a game update renamed an ID. The save
importer flattened every field into a `Partial<ProgressState>`: an absent list became an empty set,
an absent level became zero, unmatched almanac, recipe, & museum IDs were skipped silently, and the
parser threw away the `header` & `info` entries that could identify a save. Nothing downstream could
tell “the save says none” from “the save didn't say”.

## Decision

- **`extractSave` returns a field per progress fact**, each with its value, a `complete` or
  `unknown` flag, its diagnostics, & the untracked IDs it saw. Only a `complete` field may ever
  support removing progress; an `unknown` one only adds.
- **Absent or malformed means `unknown` with no value**, never an empty set or a zero. A field that
  combines several save keys (mount appearances, quest states) is complete only when all of them
  are. A level clamped from above its maximum stays complete, since the save still proves at least
  the maximum.
- **Defaults never make a field complete.** Default recipes, starting cosmetics, & default animal
  variants are credited whether or not the save lists them, but a field is `complete` only when its
  save source was read in full.
- **Relationships are never complete.** The importer reads only the dating flags, so it can't speak
  to marriage or any other relationship.
- **Mount appearances are never complete.** The Mistmare is inferred from `reveal_mistmare` in
  `scene_history`, ~150 scene IDs in a late-game save. Without a catalog to check them against, a
  renamed reveal scene would read as a Mistmare not yet revealed, so the field only ever adds.
- **Three classes of ID.** Tracked IDs map to tracker data. Known-but-untracked IDs are game IDs the
  tracker deliberately leaves out: any item in tracker data outside the almanac, plus a reviewed
  list in `src/lib/engine/untracked-save-ids.ts` (cosmetic token items, treasure chests, the
  Mistmare's perks). Everything else is unrecognized, warned about, & makes its field `unknown`.
- **Diagnostics extend the player-facing warnings** with `absent` & `invalid-value`, which the
  import never shows. `extractSaveProgress` keeps the additive import working on top: every value it
  could read, plus the warnings.
- **Identity is retained:** `info.creation_version` & `header.playtime`, read from a `.sav` or from
  `header.json` & `info.json`. An unreadable identity entry leaves those facts unknown rather than
  rejecting the save.

## Alternatives

- **Emit a catalog of every game ID from the pipeline.** Rejected for now: it adds the shared
  contract, a regenerated `tracker-data.json`, & thousands of IDs to the client for the ten IDs real
  v1.0.8 saves need. The reviewed list is guarded instead: `import-save.assets.test.ts` fails when a
  real save holds an unrecognized ID.
- **Check scene IDs against a catalog, so mount appearances can be complete.** Rejected for now: a
  reviewed list would need every scene a real save can hold (~150 in one late-game save, and more
  with each content update), and a pipeline catalog from `fiddle/cutscenes.toml` is a
  shared-contract change & data regeneration of its own.
- **Keep empty defaults for absent fields.** Rejected: an empty set is indistinguishable from a save
  that recorded nothing, which is exactly the false removal sync must avoid.
- **Reject a save with an unreadable identity entry.** Rejected: identity only labels a save, and
  the additive import shouldn't fail over a label.

## Revisit if

- A game update adds untracked IDs often enough that the reviewed list churns; then the pipeline
  should emit the catalog.
- The importer starts reading other relationship facts (marriage), which could make relationships
  complete.
- The pipeline emits the game's scene catalog for another reason, which would let mount appearances
  be complete.
- Sync needs per-entry rather than per-field completeness, for example to remove one quest while
  another quest's ID is unrecognized.
