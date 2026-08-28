# Source integrity & redaction repair

## Context

Issue #97 audited 213 generated item & recipe source rows against the Fields of Mistria wiki. The
audit found 21 factual disagreements, five sampled render failures, & 25 unverifiable rows. A
full-dataset pass found broader contract failures:

- 74 of 153 quest source rows cannot render a label;
- Void Herb carries an invalid `mine` source without a biome;
- all 240 perk-bearing source rows miss their intended skill-level fragment gate; and
- progression-bearing store availability is not consistently projected into entity visibility or
  source text.

The audit ledger is `docs/superpowers/notes/2026-08-24-issue-97-wiki-source-audit.md`. Game assets
remain authoritative; wiki disagreements are research prompts, not automatic override instructions.

## Goals

1. Make every generated source structurally valid & renderable with production lookups.
2. Restore progressive redaction for quest, perk, mine, & supported store-stock gates.
3. Correct source facts that are corroborated by native assets or explicit reviewed evidence.
4. Encode the repaired contracts in exhaustive automated tests.
5. Preserve unsupported native predicates for a later progression-tracking issue without
   over-redacting current content.

## Non-goals

- Do not add user-state tracking for arbitrary native predicates such as `has_upper_floor` or
  `is_dating_someone`.
- Do not convert wiki-only disagreements into overrides without case-specific native or reviewed
  evidence.
- Do not redesign the complete `Source` or `VisibilityCondition` unions.
- Do not hand-edit `src/lib/data/tracker-data.json`.
- Do not make the wiki authoritative over extracted game assets.

## Evidence policy

Every factual disagreement receives one of three dispositions:

1. **Native-confirmed correction:** the structured game assets corroborate the wiki. Fix the
   extractor or native-data interpretation.
2. **Reviewed override:** the acquisition behavior is not encoded in structured assets, but direct
   wiki evidence plus project-owner judgment establishes the intended behavior. Add or amend a
   narrowly scoped entry in `reviewed-overrides.ts` with a citation & regression test.
3. **Unresolved or wiki-stale:** native assets contradict the wiki or neither source is conclusive.
   Preserve current native behavior & document the result in the audit ledger.

Absence from a wiki page is not sufficient evidence for removal. Broad fixes must be derived from
shared contracts; reviewed overrides remain exceptional.

## Design

### Quest source normalization

Generated quest sources must carry app-facing `QuestType` values rather than raw TOML group names.
`buildQuestRecipeSource()` will use the existing `QUEST_TYPE_MAP`:

| Native group           | App quest type |
| ---------------------- | -------------- |
| `fetch_quests`         | `fetch`        |
| `heart_quests`         | `heart`        |
| `crown_quests`         | `crown`        |
| `story_quests`         | `story`        |
| `stillwell_challenges` | `mission`      |
| `tali_challenges`      | `cooking`      |

The extractor will retain native-group checks only for group-specific metadata such as
`requestedItemId` & `challengeRecipeId`; it will write the normalized type into the source object.
The unsafe `questType as QuestType` cast will be removed.

Quest sources created outside the recipe extractor must also render without relying on accidental
membership in `trackerData.quests`. The pipeline will build a normalized quest-type index from
tracked native groups. Reviewed quest overrides will specify a normalized type only when their quest
IDs cannot be resolved from that index. Validation will reject any emitted `questType` value outside
the closed app union.

This preserves the existing per-quest formatter behavior:

- fetch requests show NPC & requested item;
- cooking challenges show the challenged recipe;
- Stillwell challenges use mission wording;
- story quests use story wording; and
- crown & heart quests retain their specialized forms.

### Production perk lookup

`buildBaseSegmentLookups()` will flatten `trackerData.skills[*].perkTiers` into a lookup keyed by
`PerkId`. Every entry will contain:

- the perk name;
- its owning `skillId`; and
- its one-based tier number.

The existing `RecipeSourceLookups.perks` type already describes this flattened shape. Only the
production construction in `buildBaseSegmentLookups()` changes; no lookup interface migration is
required.

`buildPerkLabel()` will index `perkTierLevels` with `tier - 1`, matching the visibility pipeline.
Fallback title-casing remains only for malformed or synthetic test data; generated-data contract
tests will prove that no production source uses the fallback.

The repaired lookup restores the intended segment contract:

- perk names reveal at the tier’s skill-level threshold;
- the skill name & tier number remain visible structural context;
- `mines_chest` sources independently gate biome & perk fragments; and
- `mines_dig_site` retains its stronger top-level `perkUnlocked` mechanic gate, then applies biome
  redaction inside the revealed branch.

### Availability projection

The pipeline will add one shared, conservative projection from `AvailabilityCondition` to
`VisibilityCondition`. It will be used wherever entity visibility is derived from acquisition
sources.

Supported leaves map as follows:

| Availability condition | Visibility condition         |
| ---------------------- | ---------------------------- |
| `always`               | `always`                     |
| `heartLevel`           | `heartLevel`                 |
| `minesLevel`           | `minesLevel`                 |
| `perkUnlocked`         | `perkUnlocked`               |
| `quest`, available     | `questAvailable`             |
| `quest`, completed     | `questCompleted`             |
| `skillLevel`           | `skillLevel`                 |
| `all`                  | simplified `and`             |
| `any`                  | conservative simplified `or` |

The projection reuses the existing `simplifyCondition()` implementation rather than introducing a
second Boolean-tree simplifier.

Season, weather, & time remain availability-only because they are filters, not spoiler gates. `not`
& unsupported `gamePredicate` leaves project to `always`. This prevents unsupported state from
hiding content forever. When an unsupported leaf occurs under `any`, its `always` projection makes
the whole spoiler condition `always`, which is conservative: uncertainty reveals rather than
over-redacts.

The existing native requirement resolver remains responsible for converting resolvable predicates
before this projection. In particular, mapped `seen_cutscene` requirements become quest conditions.
Unmapped `seen_cutscene`, `has_upper_floor`, `is_dating_someone`, & other opaque predicates remain
in `source.availability`, emit a diagnostic in generated-data contract tests, & belong to the later
“track unsupported progression predicates” issue.

The projection composes with, rather than replaces, `acquisitionSourceCondition()`. For each source,
the existing variant-derived condition and the projected `source.availability` condition are
combined with simplified `and`. Store sources therefore retain their store-level disclosure gate
while gaining stock-level progression gates. The composed conditions then participate in the
existing `or` across alternative sources.

### Entity & source gates

Entity visibility remains the least restrictive valid acquisition path: source-derived conditions
are combined with `or`, so one known ungated source keeps the entity visible. Conditions within one
source combine with `and`.

For store sources:

1. The store’s own visibility gate controls disclosure of the store name.
2. The supported projection of stock `availability` contributes to entity visibility.
3. Resolvable repair or upgrade gates contribute a source qualifier.
4. Perk, skill, mine-floor, heart, & quest stock gates contribute truthful conditional source
   fragments rather than the generic “after upgrading” phrase.
5. Unsupported predicates do not contribute redaction fragments, but remain available to filters &
   diagnostics.

Store qualifier grammar will be explicit by gate type:

- repair or upgrade quest: ` (after repairing)` or ` (after upgrading)`;
- perk: `, with the <perk label>`;
- skill level: `, at <skill> level <level>`;
- mine floor: `, after reaching Mines floor <floor>`;
- heart level: `, at <level> hearts with <NPC>`; and
- other quest: `, after completing <quest>`.

Store-level repair or upgrade wording continues to use the store record’s existing `upgradeAction`
field. The new qualifier grammar describes stock-level availability; it does not replace or infer
the store’s repair-versus-upgrade action.

Composite `all` conditions append every supported fragment in stable order. Composite `any`
conditions use one grouped “after one of” fragment only when every branch has a supported,
renderable description; otherwise the qualifier is omitted to avoid false specificity. Omitting the
whole qualifier when any branch is unsupported is deliberate: listing only known branches would
imply that they are exhaustive.

The same projection helper will serve items, recipes, cosmetics, & other tracker entities. Source
stamping must not mutate shared source objects across entities; each emitted source retains its own
visibility metadata.

### Void Herb

Void Herb will receive a reviewed override based on project-owner judgment:

- source type: `forage`;
- location: the Mines, covering every biome rather than Ancient Ruins only; and
- availability & entity visibility: completion of story quest `find_the_magic_key` (“Find the Magic
  Key”).

The label becomes “Forage at Mines”, avoiding the incorrect implication that the herb is obtained by
mining. The quest gate redacts the entity until completion. The override citation will include the
[Void Herb wiki page](https://fieldsofmistria.wiki.gg/wiki/Void_Herb) plus a note that the exact
quest gate is a reviewed project-owner decision.

The invalid `{ type: "mine" }` record is removed. Validation must reject every `mine` source that
lacks `biomeId`. The TypeScript union already requires this field; runtime validation protects the
generated JSON boundary & reviewed data that may bypass compile-time inference.

### Case-by-case corrections

The 21 factual wiki disagreements will be checked against native assets before code changes. Each
case will be recorded in the audit ledger with its disposition. The first pass covers:

- bait rarity for Iron Fish, Silver Squid, Bait Thief, Blue Crab, Hake, & Sea Urchin;
- Gar’s dive source;
- the letter triggers for Big Cookie, Dozy’s Dog Bed, Temple Flower Seed, & Valen’s Workstation;
- Void Stone & Void Powder;
- Gemstone Bridge’s museum threshold;
- Breath of Spring Basket, Rabbit Plushie, & Hayden’s Weathervane quest semantics;
- Maple’s Aldarian Star Drawing & Royal Chest; and
- Dragon Road Wall & Water Altar Wishing Well costs.

Changes with native evidence belong in their extractor. Runtime-only behavior belongs in reviewed
overrides. Conflicts remain unchanged & documented. Additional fixed-seed wiki checks may add cases,
but they follow the same evidence policy & cannot silently enlarge the source schema.

## Validation & tests

Implementation follows test-driven development. Tests are added before each production change.

### Generated-data contracts

A generated-data integration test will iterate every item, recipe, cosmetic, & other tracker entity
with sources using production segment lookups. It will assert:

- every source returns a non-empty segment array;
- revealed & fully redacted rendering complete without throwing;
- every referenced biome, perk, quest type, store, & required identifier resolves;
- every emitted `questType` belongs to the closed `QuestType` union;
- every `mine` source has `biomeId`; and
- no production perk-bearing label uses fallback metadata.

The test reports the entity kind, ID, source index, & source object on failure.

### Focused tests

- Recipe extraction maps all native quest groups through `QUEST_TYPE_MAP` while preserving fetch &
  cooking metadata.
- Reviewed quest overrides without tracker membership render through explicit normalized metadata.
- Production perk lookup flattening returns the correct name, skill, tier, & threshold for every
  perk.
- Availability projection covers each supported leaf, nested `all`, nested `any`, `not`, timely
  conditions, mapped predicates, & unsupported predicates.
- Entity visibility uses OR across sources & AND within a source.
- Store segments cover repair, upgrade, perk, skill, mines, heart, quest, composite, & unsupported
  gates without leaking names early.
- Void Herb has the exact reviewed source & quest visibility.
- Every native-confirmed factual correction receives a narrow regression test.

### Diagnostics

Unsupported visibility predicates do not fail generation in this PR. A deterministic contract-test
diagnostic lists their predicate names & affected entity IDs. The follow-up issue uses this list as
its initial scope. Missing required discriminant fields, unknown normalized quest types, or source
label render failures remain hard failures.

## Data flow

1. Native TOML is parsed & evaluated.
2. Acquisition collectors emit normalized `Source` objects with complete availability conditions.
3. Reviewed overrides replace only explicitly researched runtime-only cases.
4. Availability conditions are conservatively projected into visibility conditions.
5. Entity visibility & per-source disclosure metadata are stamped without losing availability.
6. Generated data validation checks structural & reference integrity.
7. The app builds complete production lookups & renders conditional source segments.

## Compatibility

The existing `Source`, `AvailabilityCondition`, & `VisibilityCondition` schemas remain compatible.
Generated quest `questType` values change from invalid raw group strings to values already declared
by the public type. Store sources retain existing availability data and gain corrected visibility
metadata or richer rendered fragments.

Regenerating `tracker-data.json` is required. Transfer encoding is unaffected because source
metadata does not participate in deterministic completion ordering.

## Follow-up

Create a separate issue to track unsupported progression facts used by source availability, starting
with the deterministic diagnostic output. That issue may extend imported save state &
`UserProgressionState` for facts such as house upgrades, dating state, & native flags. Until then,
unsupported predicates remain availability-only & never cause permanent redaction.
