# Game version update protocol

> Review protocol for updating Mistria Field Guide to a new Fields of Mistria release.

## Purpose

Mistria Field Guide does not ingest new game data automatically. Every supported Fields of Mistria
version is added through a reviewed application release. This protocol makes that review explicit
without predicting how a future game release will change IDs, schemas, or progression.

The protocol applies whenever the pipeline input moves to a different game version. It also applies
when a same-version regeneration changes trackable IDs, canonical groupings, or another
compatibility-sensitive ordering.

This document is a decision framework, not a promise that arbitrary future data will migrate
automatically. Add compatibility code, migrations, fixtures, or notices only after the candidate
data shows what is required.

## Version meanings

Keep the existing versions conceptually separate:

- `trackerData.version` identifies the source Fields of Mistria version used to generate the bundled
  tracker data.
- The serialized user-state `version` identifies the localStorage and JSON backup shape. Change it
  only when persisted user state becomes incompatible or needs a new migration path.
- `STORAGE_KEY` (currently `"mistria-fyi-v1"` in `user-state.svelte.ts`) identifies the localStorage
  slot itself. Changing the key abandons existing browser state entirely rather than migrating it,
  which is a different decision from bumping the serialized `version` field.
- `TRANSFER_VERSION` identifies the progress-transfer codec. Change it only when the encoded fields,
  their interpretation, or their positional layout changes incompatibly.
- The Mistria Field Guide application version identifies the deployed application release.

Do not add another version axis speculatively. Introduce one when a concrete release demonstrates
that the existing versions cannot distinguish states the application must handle.

## Prepare the update

Before changing pipeline code or generated data:

1. Open an issue for the new game version and link the upstream release notes or other authoritative
   source material.
2. Record the currently supported game version, application commit, serialized-state version, and
   transfer version.
3. Obtain a clean copy of the new game assets. Keep the preceding supported assets available for
   comparison until the update ships.
4. Create the normal isolated worktree and establish a clean verification baseline.
5. Review the new assets and upstream notes before relaxing parser, extractor, or test expectations.
   A changed fixture count is evidence to investigate, not a value to update mechanically.

The committed tracker data at the starting commit is the rollback baseline. Do not hand-edit
`src/lib/data/tracker-data.json` or replace that baseline outside the version-update branch.

## Generate the candidate

Run the pipeline against the new assets in the isolated worktree. Update version-specific parser or
integration-test profiles deliberately when the new asset layout requires it.

```sh
MISTRIA_ASSETS=/path/to/new/assets pnpm run test:pipeline:assets
pnpm run pipeline -- /path/to/new/assets
```

Treat the regenerated data as a candidate until the semantic review is complete. Inspect the
readable pipeline artifact or a purpose-built comparison rather than relying only on the minified
JSON diff.

## Classify changes

Compare the previous and candidate datasets by domain. At minimum, inspect almanac entries and their
canonical members, recipes, museum items, cosmetics, animal variants and cosmetics, pets, villagers,
relationships and dates, skills and perks, quests, spells, progression ranges, visibility
conditions, and acquisition sources.

Classify every compatibility-relevant difference:

| Change            | Required review                                                                                                                                                                                                                                                                                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Addition          | Confirm whether the entry should start unchecked, be default-completed, or be inferred from an imported save. Verify that totals and transfer ordering remain correct.                                                                                                                                                                                            |
| Removal           | Determine whether the ID was deleted, renamed, regrouped, made unobtainable, or intentionally no longer tracked. Decide explicitly whether prior completion is retained, migrated, reported, or discarded.                                                                                                                                                        |
| Rename            | Establish evidence that the old and new IDs represent the same progress. Add the narrowest explicit mapping required at every affected persistence boundary.                                                                                                                                                                                                      |
| Regrouping        | Check whether an almanac canonical ID, recipe identity, museum membership, or another many-to-one representation changed while the underlying game objects remained. Note that canonical IDs are derived (alphabetically-first member of a recipe group), so adding a new member that sorts earlier silently changes the canonical ID without an explicit rename. |
| Schema change     | Update the shared tracker-data contract, pipeline assembly, every application consumer, and relevant tests together. Decide whether the change affects persisted state or transfers independently.                                                                                                                                                                |
| Value-only change | Review user-visible labels, sources, restrictions, visibility, and progress semantics even when IDs are stable.                                                                                                                                                                                                                                                   |

Do not infer a rename merely because one ID disappeared while another appeared. Preserve ambiguity
in the version-update issue until native data or another authoritative source establishes the
relationship.

## Review compatibility

Evaluate each compatibility surface separately. A change that is harmless for one surface may be
destructive for another.

### Local state and backups

The browser state and exported JSON backup contain literal completion IDs. For removals, renames,
and regroupings, test a representative state created by the preceding release against the candidate
application.

Decide and document:

- Whether old IDs remain recognized.
- Whether a targeted migration is necessary.
- Whether unknown IDs are retained, reported, or discarded.
- Whether an old backup restores without losing unrelated progress.
- Whether the serialized-state version actually needs to change.

Do not bump the serialized-state version merely because `tracker-data.json` changed.

### Save import

The game-save importer validates native IDs against the bundled tracker data and normalizes some
domains. Verify imports from both the preceding and new game versions when players can reasonably
have either save format. Update warnings and fixtures for any changed native fields or identifiers.

State explicitly when support for importing an older game save is dropped.

### Progress transfer

Transfer payloads use positional orderings derived from tracker data. Adding, removing, renaming, or
reordering an encoded ID can reinterpret bits in a payload created by an earlier application
release, even when a current-data round-trip test passes.

For every candidate dataset, materialize each transfer ordering from the preceding and candidate
application revisions, then diff the resulting ID arrays. The runtime helpers in `transfer.ts`, such
as `getAlmanacOrder()`, define these orderings. Existing historical payload fixtures are a separate
decoder regression check; they do not prove that the complete layout is unchanged. Run them against
the candidate decoder, and add fixtures that exercise affected positions when an ordering changes.
If any ordering or encoded field changes, choose and document one of these responses:

- Preserve the historical ordering in the decoder and add a historical payload fixture.
- Bump the transfer codec and provide a backward-compatible decoding path.
- Declare older payloads unsupported, reject them rather than misinterpreting them, and communicate
  the limitation.

Never allow an old transfer payload to decode successfully into different progress. If this review
becomes repetitive or error-prone, add a committed layout fingerprint or immutable layout manifest
as part of the concrete version-update work.

### User communication

Decide after the data review whether players need a notice or change summary. Add one when the
release migrates, archives, drops, or materially reinterprets their progress. Routine additions that
start unchecked do not require a compatibility notice.

## Record the decision

The version-update issue or pull request must include a compatibility report with:

- The old and new game versions.
- Added, removed, renamed, and regrouped IDs by domain.
- Tracker schema changes.
- Local-state, backup, save-import, and transfer consequences.
- The migration policy and historical fixtures added, or an explanation of why none are needed.
- Any user-facing notice.
- The rollback constraint for the release.

Use this conclusion when the review finds no incompatibility: “No persisted-state or transfer
compatibility change is required”. Support that conclusion with the reviewed comparisons and tests.

## Verify and release

Run the full repository [verification matrix](development-workflow.md#5-verification-matrix).
Pipeline and shared tracker-contract changes also require both real-data checks against the new
assets. When practical, run the preceding version’s historical integration fixtures as well.

Before merging, verify that:

- The generated `trackerData.version` matches the intended game release.
- The committed generated-data diff contains only reviewed changes.
- A preceding-release local state and backup load with the decided behavior.
- Save imports behave as documented for every supported game-save version.
- Historical transfer fixtures decode to their original progress.
- Release notes describe any migration, dropped compatibility, or required player action.

Ship application code and generated tracker data in the same deployment. Do not publish candidate
tracker data independently of the code and tests reviewed with it.

## Roll back

The default rollback is to redeploy the preceding atomic application-and-data release. Before doing
so, determine whether the candidate release wrote user state that the preceding application cannot
read or reversibly interpret.

If persisted state changed incompatibly, do not blindly redeploy the old application. Prefer a
corrective release that restores the preceding tracker data while retaining the newer state reader
and any required compatibility mappings. Document any exceptional recovery steps in the
version-update issue and release notes.

Keep the rejected generated artifact, comparison, and diagnosis on the update branch or issue until
the rollback or corrective release is verified.

## Update record template

Append a short entry here, or link a version-specific document, when a game update establishes a
lasting compatibility precedent:

```markdown
### Fields of Mistria X.Y.Z

- MFG release or commit:
- ID changes:
- Schema changes:
- Persisted-state decision:
- Save-import decision:
- Transfer decision:
- User communication:
- Rollback constraint:
- Tests and fixtures:
```
