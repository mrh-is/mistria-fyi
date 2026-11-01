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
data shows what is required. Never discard saved player state to avoid writing a migration.

## Version meanings

Keep the existing versions conceptually separate:

- `trackerData.version` identifies the source Fields of Mistria version used to generate the bundled
  tracker data.
- The serialized user-state `version` identifies the localStorage and JSON backup shape. Change it
  only when persisted user state becomes incompatible or needs a new migration path.
- `PROGRESS_STORAGE_KEY` (`"mistria-fyi:progress"` in `src/lib/stores/storage-keys.ts`) identifies
  the localStorage slot itself. Changing the key abandons existing browser state entirely rather
  than migrating it, which is a different decision from bumping the serialized `version` field.
  Changing the key (or otherwise abandoning state) needs an explicit decision record in
  `docs/decisions/`.
- The Mistria Field Guide application version identifies the exact deployed commit. Production
  builds derive it deterministically from the commit date and abbreviated SHA. Transfer codes carry
  a fingerprint of it, so a code only decodes on the build that created it. `package.json`'s version
  and Git version tags identify intentional product releases rather than routine deploys.

Do not add another version axis speculatively. Introduce one when a concrete release demonstrates
that the existing versions cannot distinguish states the application must handle.

## Prepare the update

Before changing pipeline code or generated data:

1. Open an issue for the new game version and link the upstream release notes or other authoritative
   source material. The game build watch workflow files this issue automatically when the public
   Steam build changes; update the game in Steam and confirm the installed build matches the issue.
2. Record the currently supported game version, application commit, and serialized-state version.
3. Obtain a clean copy of the new game assets and share it, with the current saves, as described in
   [Share the extracted assets](#share-the-extracted-assets). The preceding version’s Drive folder
   stays available for comparison.
4. Create the normal isolated worktree and establish a clean verification baseline.
5. Review the new assets and upstream notes before relaxing parser, extractor, or test expectations.
   A changed fixture count is evidence to investigate, not a value to update mechanically. Start by
   diffing the new asset tree against the preceding version’s (`diff -rq vA/assets vB/assets`,
   ignoring Drive’s `desktop.ini` files) to scope the update. When `fiddle/`, `data_files/`, and the
   English localization are unchanged, as in 1.0.8, expect the tracker data and locale chunks to
   change only in translations and `trackerData.version`. Icons come from the full `assets.zip`,
   which the shared tree omits, so still run the sprite upload dry run.

The committed tracker data at the starting commit is the rollback baseline. Do not hand-edit
`src/lib/data/tracker-data.json` or replace that baseline outside the version-update branch.

## Share the extracted assets

The game is installed only on the gaming PC. Once Steam has installed the new release there, run:

```sh
pnpm run game-assets:share -- --dry-run   # review the plan
pnpm run game-assets:share
```

It reads the version from `FieldsOfMistria.exe` and extracts `fiddle/`, `localization/`,
`data_files/`, `etc/`, `gml/`, and `tiled/` from the Steam install’s `assets.zip`. It never extracts
or uploads the multi-gigabyte animation and audio trees. It also copies each autosave from
`%LOCALAPPDATA%\FieldsOfMistria\saves`, filed by the game version that last wrote it (read from the
save’s `info` entry), and keeps the newer copy when one already exists. Existing assets are left
alone unless you pass `--force`. Google Drive for desktop syncs the result to this layout:

```text
G:\My Drive\Mistria\
  vX.Y.Z\
    assets\   extracted structured-assets root (contains fiddle\)
    save\     autosaves last written by game X.Y.Z
  archive\    older unversioned dumps & saves
```

A version folder can have `save\` without `assets\` when the only save from that release predates
the update. Pass `--drive=<dir>` or set `MISTRIA_DRIVE_DIR` if the Drive folder lives elsewhere.

Other machines symlink `pipeline/input` to the synced Drive folder that holds the `vX.Y.Z/` folders;
the pipeline picks `vX.Y.Z/assets` from `--version`.

## Generate the candidate

Run the pipeline against the shared copy in the isolated worktree. Set `CURRENT_GAME_VERSION`
(`pipeline/src/game-version.ts`) to the new version first; it is the one place the supported version
lives. `pipeline:assets` & the canonical parse profile read it, and the real-asset suite follows the
regenerated tracker data's version. Update the canonical parser profile and real-asset expectations
deliberately when the new asset layout requires it. On the gaming PC:

```sh
MISTRIA_ASSETS="G:\My Drive\Mistria\vX.Y.Z\assets" pnpm run test:pipeline:assets
pnpm run pipeline -- "G:\My Drive\Mistria\vX.Y.Z\assets" --version=X.Y.Z --sprites
pnpm run sprites:manifest
```

`--sprites` reads icons from the installed Steam `assets.zip` when it is the same version, so sprite
staging only works on the gaming PC. `sprites:manifest` refreshes the browser suites’ sprite fixture
from the staged files.

Treat the regenerated data as a candidate until the semantic review is complete. Run
`pnpm run data:diff HEAD` for a path-level listing of what changed; the committed file is
pretty-printed, so its Git diff is readable too, though GitHub collapses it as generated. Agent
hooks deny direct reads of the generated tracker data, but `data:diff` reads it through Git, so
agents use it instead. The locale chunks are pretty-printed, so their Git diff is reviewable; check
that no keys were added or removed and that changed values are new translations.

### Upload sprites

New items need their icons in the `assets.mistria.fyi` bucket before the release deploys, or they
render as missing (1.0.5’s new items went without icons until the 1.0.6 update). After the candidate
is reviewed:

```sh
DRY_RUN=1 pnpm run sprites:upload   # lists `would put` for each new or changed sprite
pnpm run sprites:upload
```

The upload skips every sprite whose production ETag already matches. The check adds a unique query
string so it reads the bucket’s current object rather than a stale edge-cached copy. If the dry run
would replace an existing sprite, its pixels changed: bump `spriteGeneration` in
`src/lib/sprites/sprite-url.ts` in the same pull request (see [sprite assets](sprite-assets.md)).
Wrangler authenticates with the R2 upload token: `R2_UPLOAD_TOKEN` & `CLOUDFLARE_ACCOUNT_ID`, which
the upload scripts load from `.env.r2-upload` or the shell
([machine setup](machine-setup.md#needed-for-specific-work)). If
`node scripts/machine-doctor.ts --for release` lists the token as a todo, ask the maintainer to set
it up; an agent never creates, reads, or prints it. Without the token, a real upload refuses to
start; it never falls back to a stored `wrangler login`.

After the upload, rerun the review report (see [Classify changes](#classify-changes)) as the gate:
it exits 0 only once production has every staged sprite.

## Classify changes

Start from the structural diff of the game files:
`pnpm run pipeline:atlas -- --version=<candidate> --compare=<previous>` writes
`pipeline/output/asset-atlas/diff-v<previous>-v<candidate>.md`, listing files, fiddle roots, & keys
added, removed, or reshaped, and which pipeline modules claim each root (see
[game-asset-format.md](game-asset-format.md#checking-a-version)). Use it to find new or changed
native domains, including unclaimed ones a new feature may need.

Generate the mechanical comparison with the report script, naming the baseline commit (the last
release’s data commit, or `origin/main` before the candidate is committed):

```sh
pnpm run game-update:report -- <baseline-ref> --out=update-report.md
```

It prints, as markdown, the ID inventory by domain (additions & removals, with the almanac entries
by canonical ID & by member so regroupings show), the contract-key changes (top-level keys & each
domain’s entry fields, & keys inside `mines`, `mount`, `pets`, & `quests`), & the sprite deltas from
the upload dry run. A field counts as added only when no baseline entry had it, so one that spreads
to more entries does not show. `--out` writes UTF-8 without pnpm’s banner, unlike a shell redirect.

The first run comes before the sprite upload, so it exits 1 and its sprite section lists what the
upload will send, new & changed; post that run’s report, since it records the deltas. After
[uploading the sprites](#upload-sprites), rerun it as the gate, which exits 0 only when the dry run
lists nothing. It fails when the staged directory is missing, empty, or holds anything but `.webp`
files, & warns when an added item or villager has no staged sprite. `--skip-sprites` omits the check
when no sprites are staged, & the report then says production was not checked. It does not infer
renames. `DOMAINS` in `scripts/game-update-report.ts` is the domain list, & its `COVERAGE` map is
typed against the tracker-data contract, so a new top-level key must be classified there.

Then inspect what the report cannot: value-only changes, relationships and dates, perk tiers,
progression ranges, visibility conditions, & acquisition sources, along with the review of each
addition, removal, & regrouping it lists.

Classify every compatibility-relevant difference:

| Change            | Required review                                                                                                                                                                                                                                                                                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Addition          | Confirm whether the entry should start unchecked, be default-completed, or be inferred from an imported save. Verify that totals remain correct.                                                                                                                                                                                                                  |
| Removal           | Determine whether the ID was deleted, renamed, regrouped, made unobtainable, or intentionally no longer tracked. Decide explicitly whether prior completion is retained, migrated, reported, or discarded.                                                                                                                                                        |
| Rename            | Establish evidence that the old and new IDs represent the same progress. Add the narrowest explicit mapping required at every affected persistence boundary.                                                                                                                                                                                                      |
| Regrouping        | Check whether an almanac canonical ID, recipe identity, museum membership, or another many-to-one representation changed while the underlying game objects remained. Note that canonical IDs are derived (alphabetically-first member of a recipe group), so adding a new member that sorts earlier silently changes the canonical ID without an explicit rename. |
| Schema change     | Update the shared tracker-data contract, pipeline assembly, every application consumer, and relevant tests together. Decide whether the change affects persisted state.                                                                                                                                                                                           |
| Value-only change | Review user-visible labels, sources, restrictions, visibility, and progress semantics even when IDs are stable.                                                                                                                                                                                                                                                   |

Do not infer a rename merely because one ID disappeared while another appeared. Preserve ambiguity
in the version-update issue until native data or another authoritative source establishes the
relationship.

### Name same-name almanac rows

Some almanac rows share a name within a category: six “Animated Clouds Window” rows differ only in
color. The game names none of its colorways, so `pipeline/src/overrides/item-variants.ts` names each
such row, and the almanac extractor throws until every set is reviewed. It also throws when a
reviewed set gains or loses a row, or when a row’s English description changes. The error lists each
uncovered set with a proposal from `proposeItemVariants` (`pipeline/src/extract/item-variants.ts`).

For each set, the agent running the update proposes an entry:

1. Derive each row’s differentiator from the description diff: the phrase its description doesn’t
   share with the others. A description word beats an ID word (`haunted_attic_wall_cobweb_left_dark`
   says “purple”, not “dark”). Fall back to the ID diff only when every description is identical.
2. Name colors, plus the wood when rows differ by wood (“Oak”, “Walnut & green”). Don’t name other
   materials: the tea sets’ “oak tray and a green lidded cup” reads “Oak & green”, not “Oak tray,
   green cup”.
3. Add a word only when the set needs it to tell rows apart, and drop the rest:
   - When rows differ in two parts and one part alone repeats, name both. The Ornate Cabinets read
     “Walnut & green” & “Walnut & gold”.
   - When one part alone is unique, name only that one. The Ornate Sofas name the upholstery color,
     not the frame.
   - When colors alone don’t distinguish the item, add its shape, but no size: the Ruins Pots read
     “White goblet”, “Orange gourd”, & “Cracked purple” (from “A small cracked purple clay pot”).
4. When only one row names a difference, give the other row its natural counterpart: “Plain” against
   “Gold accents”, “Single” against `starter_stone_path_double`’s “Double”. Leave a set unnamed only
   when no row has a differentiator, or when the IDs differ only by a bare version number. Never
   invent ordinals such as “Style 1”.
5. Compare each proposal with the variant names on the
   [Fields of Mistria wiki](https://fieldsofmistria.wiki.gg/), where its editors have named them.
   The wiki is a reference, not a source: keep the game-derived name and flag a mismatch for review.
6. Commit entries it’s confident in, recording each row’s English description as evidence. Unnamed
   sets record theirs too, so a reworded description that adds a differentiator gets reviewed.
7. Present these cases to a human instead of deciding them:
   - descriptions that differ in more than one phrase (the proposal says so),
   - a differentiator that isn’t yet an `ITEM_VARIANTS` key,
   - a counterpart word under rule 4,
   - a wiki name that disagrees with the proposal,
   - a candidate merge of near-synonyms (“white” & “off-white” stay distinct by default).

A new key goes in `ITEM_VARIANTS` (`src/lib/types/tracker-data.ts`), as a `variant_<key>` message in
every `messages/<locale>.json`, in `src/lib/data/item-variants.ts`, & in
`pipeline/src/overrides/item-variant-terms.ts`. Keys name phrases, not tokens (`light_brown`, not
`light` + `brown`), so each locale orders its words naturally. Take each locale’s term from that
locale’s own description of a row with that variant: the game’s translators already chose it (purple
is “violet” in French, “morado” in Spanish, 보라색 in Korean). Descriptions inflect words for their
nouns, so normalize to a standalone form (masculine singular where gender applies). Record the row
as `evidence` and the locale under `game`. Where a locale’s description falls back to English or
doesn’t name the difference, machine-translate with the full English description as context, list
the locale under `machine`, & flag it for human review. `item-variants.assets.test.ts` checks the
coverage, every locale’s message, & each `game` locale’s evidence.

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

Transfer codes need no review. Each code carries a fingerprint of the app build that created it, and
only the same build decodes it, so a game update can’t reinterpret an outstanding code. See
[the progress transfer format](transfer-format.md#build-binding).

### User communication

Decide after the data review whether players need a notice or change summary. Add one when the
release migrates, archives, drops, or materially reinterprets their progress. Routine additions that
start unchecked do not require a compatibility notice.

## Record the decision

The version-update issue or pull request must include a compatibility report with:

- The old and new game versions.
- Added, removed, renamed, and regrouped IDs by domain.
- Tracker schema changes.
- Local-state, backup, and save-import consequences.
- The migration policy and historical fixtures added, or an explanation of why none are needed.
- Any user-facing notice.
- The rollback constraint for the release.

Post the output of `pnpm run game-update:report -- <baseline-ref>` (the ID inventory by domain,
compared from the baseline commit, with the contract-key changes & sprite deltas) as its own PR
comment, as #41 did. It is the durable diff later updates compare against. Renames are the one part
it cannot produce: add them by hand, each with its evidence.

Use this conclusion when the review finds no incompatibility: “No persisted-state compatibility
change is required”. Support that conclusion with the reviewed comparisons and tests.

## Verify and release

A game version update regenerates `tracker-data.json`, so it is one of the explicit exceptions in
[verification policy](agent-verification.md#full-verification): run the full local
[verification matrix](development-workflow.md#5-verification-matrix) with `pnpm run verify`, plus
both real-data checks against the new assets. When practical, run the preceding version’s historical
integration fixtures as well.

Before merging, verify that:

- The generated `trackerData.version` matches the intended game release.
- The committed generated-data diff contains only reviewed changes.
- The new version’s assets and saves are on the shared Drive, and
  `DRY_RUN=1 pnpm run sprites:upload` reports nothing left to upload.
- A preceding-release local state and backup load with the decided behavior.
- Save imports behave as documented for every supported game-save version.
- Release notes describe any migration, dropped compatibility, or required player action.

Label the pull request `generated-data` when opening it (alongside `type: maintenance` and
`area: pipeline`); the “Guarded paths” check fails on regenerated tracker data without it.

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
- User communication:
- Rollback constraint:
- Tests and fixtures:
```
