# Issue 97 wiki source audit

**Date:** August 24, 2026

**Generated data:** August 23, 2026, v1.0.2

**Sample seed:** `issue-97-v1`

This audit compares generated item & recipe acquisition sources with the community-maintained
[Fields of Mistria wiki](https://fieldsofmistria.wiki.gg/). The game assets remain authoritative. A
wiki discrepancy means the generated data & wiki disagree; it does not establish that the wiki is
correct.

## Outcome

The generated data has broad source coverage, but it is not ready to support partial source
redaction. The audit found both row-level source disagreements & systemic rendering failures:

- 213 sampled source rows: 162 wiki matches, 21 factual disagreements, five render failures, & 25
  unverifiable rows;
- 75 source rows that cannot render a label, including 74 of 153 quest source rows;
- 240 perk-bearing source rows with no skill-level fragment gate because the production perk lookup
  is malformed;
- 234 progression-bearing item-store source rows across 228 items; 226 affected items have no
  corresponding entity visibility gate, & 64 have no ungated alternative source; and
- zero items or recipes with an empty source array, confirming that issue #78’s structural coverage
  work succeeded.

Issue #88 should not implement partial source redaction on the current contracts. Quest source
normalization, perk lookups, & item-store visibility propagation need correction first.

## Method

The audit enumerated source rows from `items[*].sources` & `recipes[*].sources` without loading the
generated file into the agent context. Rows were grouped by `source.type`, then ranked by the
SHA-256 hash of:

```text
issue-97-v1:<sampleType>:<kind>:<id>:<sourceIndex>
```

Five rows were selected per source type. The priority categories from issue #97 used 10 rows:
`letter`, `mines_chest`, `mines_dig_site`, `perk`, `quest`, `scroll_bundle`, & `store`. The retired
`store_with_perk` variant was audited as a logical subset of current `store` rows whose availability
contains `perkUnlocked`; all six available rows were included. Categories with fewer than five rows
were audited exhaustively.

Each sampled row was compared with a direct wiki page for acquisition method, location, trigger,
cost, reward threshold, & documented progression requirement. A row was marked “unverifiable” when
the wiki did not document enough detail. Absence was not treated as confirmation.

The manual comparison was supplemented with a full rendering pass over 4,741 source-label inputs
(including the six logical `store_with_perk` duplicates) & structural queries over every generated
item and recipe.

## Sample results

| Source type               | Sampled |   Match | Row issue | Unverifiable |
| ------------------------- | ------: | ------: | --------: | -----------: |
| `animal_product`          |       5 |       5 |         0 |            0 |
| `artifact_dig`            |       5 |       1 |         0 |            4 |
| `artifact_replicator`     |       5 |       5 |         0 |            0 |
| `bait_fish`               |       5 |       3 |         2 |            0 |
| `beach_cave_chest`        |       1 |       1 |         0 |            0 |
| `bug_catch`               |       5 |       5 |         0 |            0 |
| `chicken_statue`          |       5 |       5 |         0 |            0 |
| `crop`                    |       5 |       5 |         0 |            0 |
| `date`                    |       5 |       4 |         0 |            1 |
| `default`                 |       5 |       2 |         0 |            3 |
| `dive`                    |       5 |       0 |         1 |            4 |
| `engagement`              |       2 |       2 |         0 |            0 |
| `festival`                |       5 |       5 |         0 |            0 |
| `festival_activity`       |       5 |       5 |         0 |            0 |
| `fish`                    |       5 |       0 |         0 |            5 |
| `fish_trap`               |       5 |       1 |         4 |            0 |
| `forage`                  |       5 |       5 |         0 |            0 |
| `letter`                  |      10 |       6 |         4 |            0 |
| `lost_and_found`          |       5 |       0 |         0 |            5 |
| `mine`                    |       5 |       4 |         1 |            0 |
| `mine_fish`               |       5 |       5 |         0 |            0 |
| `mines_chest`             |      10 |      10 |         0 |            0 |
| `mines_dig_site`          |      10 |      10 |         0 |            0 |
| `monster`                 |       5 |       3 |         1 |            1 |
| `museum_donation`         |       5 |       4 |         1 |            0 |
| `perk`                    |      10 |      10 |         0 |            0 |
| `proposal`                |       5 |       5 |         0 |            0 |
| `quest`                   |      10 |       2 |         8 |            0 |
| `recipe`                  |       5 |       5 |         0 |            0 |
| `renown`                  |       5 |       3 |         2 |            0 |
| `scroll_bundle`           |      10 |      10 |         0 |            0 |
| `station`                 |       5 |       5 |         0 |            0 |
| `store`                   |      10 |      10 |         0 |            0 |
| logical `store_with_perk` |       6 |       6 |         0 |            0 |
| `treasure_chest`          |       5 |       5 |         0 |            0 |
| `upgrade`                 |       4 |       4 |         0 |            0 |
| `wishing_well`            |       5 |       1 |         2 |            2 |
| **Total**                 | **213** | **162** |    **26** |       **25** |

“Row issue” combines 21 factual wiki disagreements with five quest formatter failures whose
underlying source facts match the wiki. The systemic formatter & visibility defects below can also
affect rows counted as factual matches.

## Blocking defects

### Quest labels

`buildSourceSegments()` cannot render 74 of the 153 generated `quest` source rows. Recipe sources
carry raw asset-group values such as `fetch_quests`, `stillwell_challenges`, `story_quests`, &
`tali_challenges`, while the formatter switches on normalized app quest types. Thirteen other quest
sources reference quest IDs absent from the formatter’s lookup and throw “Unknown quest type”.

Five of the 10 sampled quest rows fail this way. The wiki confirms the underlying acquisitions for
[Hanging Onion Basket](https://fieldsofmistria.wiki.gg/wiki/Hanging_Onion_Basket),
[Champion’s Kitchen](https://fieldsofmistria.wiki.gg/wiki/Champion%27s_Kitchen),
[Blueberry Jam](https://fieldsofmistria.wiki.gg/wiki/Blueberry_Jam),
[Utensil Holder](https://fieldsofmistria.wiki.gg/wiki/Furniture/Kitchen_Furniture_Set), &
[Berries and Cream](https://fieldsofmistria.wiki.gg/wiki/Berries_and_Cream), but their generated
source labels are absent.

### Perk fragments

`buildBaseSegmentLookups()` assigns `trackerData.skills` directly to a lookup that
`buildPerkLabel()` indexes by `perkId`. Production lookups therefore miss every perk. Across all
generated data, none of the 240 perk-bearing source rows emits the intended `skillLevel` fragment:

| Source type      | Rows | Rows with skill-level fragment |
| ---------------- | ---: | -----------------------------: |
| `mines_chest`    |   21 |                              0 |
| `mines_dig_site` |   73 |                              0 |
| `perk`           |  146 |                              0 |

The source labels fall back to title-cased perk IDs, expose perk names without the intended tier
gate, & omit the skill/tier suffix. The wiki’s
[Skills page](https://fieldsofmistria.wiki.gg/wiki/Skills) confirms, for example, that Taste Maker
is a Cooking tier-one perk available at level one. The sampled mine recipes correctly use Taste
Maker according to the wiki, but their redaction fragments do not implement that threshold.

The formatter also indexes `perkTierLevels` by the one-based perk tier. The visibility pipeline uses
`tier - 1`; once the lookup shape is fixed, this off-by-one must be corrected as part of the same
change.

### Store progression

The six current equivalents of `store_with_perk` retain accurate `availability.perkUnlocked` facts,
confirmed by the wiki. For example, the wiki lists the
[Espresso Machine](https://fieldsofmistria.wiki.gg/wiki/Woodcrafting) at Darcy’s Stall behind the
Espresso Yourself perk. The rendered source says only “Purchase from Darcy’s Stall”, however, & the
item has no entity visibility gate.

This is broader than perk stock. Generated items contain 234 store source rows, covering 228
targets, with progression-bearing conditions in `availability`. Of those items, 226 have no
corresponding entity visibility gate, & 64 have no ungated alternative source. The rows include 88
quest leaves, 79 native `gamePredicate` leaves, 48 mines-level leaves, 14 skill-level leaves, & six
perk leaves; composite conditions can contribute more than one leaf. The six perk-gated rows were
audited a second time as the logical `store_with_perk` sample subset, but they are not duplicate
rows in generated data. Confirmed examples include:

- [Twice-Baked Rations](https://fieldsofmistria.wiki.gg/wiki/Twice-Baked_Rations), which requires
  the second food-reserves story quest;
- [Fall Crop Sign Scroll Bundle](https://fieldsofmistria.wiki.gg/wiki/Fall_Crop_Sign_Scroll_Bundle),
  which requires repairing the General Store; and
- the six perk-gated shop items represented by the logical `store_with_perk` subset.

`acquisitionSourceCondition()` derives item visibility from the source variant but ignores
progression conditions already preserved in `source.availability`. The label builder likewise uses
`source.visibility` for the store qualifier, so item stock gates neither redact the entity nor
appear in the label.

### Invalid mine source

The full rendering pass found one non-quest failure: Void Herb has `{ type: "mine" }` without the
required `biomeId`, causing the biome formatter to throw. The
[Void Herb wiki page](https://fieldsofmistria.wiki.gg/wiki/Void_Herb) describes mine foraging on any
unsealed floor after unlocking Void Sight. The generated source is both structurally invalid &
semantically incomplete.

## Row-level discrepancies

Twenty-one sampled rows disagree factually with the wiki. Native asset data must be checked before
changing the pipeline. Five additional rows have verified source facts but no rendered label; they
are included in the table as quest-label failures.

| Family          | Rows                                                                                                                                                                                                                                                                                                                                                                                                         | Wiki disagreement                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Bait fish       | [Iron Fish](https://fieldsofmistria.wiki.gg/wiki/Iron_Fish), [Silver Squid](https://fieldsofmistria.wiki.gg/wiki/Silver_Squid)                                                                                                                                                                                                                                                                               | Generated sources include Rare bait; the wiki lists Uncommon bait only.                                           |
| Dive            | [Gar](https://fieldsofmistria.wiki.gg/wiki/Gar)                                                                                                                                                                                                                                                                                                                                                              | Generated sources include river diving; the wiki classifies Gar as fishing-pole-only.                             |
| Fish trap       | [Bait Thief](https://fieldsofmistria.wiki.gg/wiki/Bait_Thief), [Blue Crab](https://fieldsofmistria.wiki.gg/wiki/Blue_Crab), [Hake](https://fieldsofmistria.wiki.gg/wiki/Hake), [Sea Urchin](https://fieldsofmistria.wiki.gg/wiki/Sea_Urchin)                                                                                                                                                                 | Generated bait sets are broader than the wiki’s listed rarity.                                                    |
| Letter          | [Big Cookie](https://fieldsofmistria.wiki.gg/wiki/Big_Cookie), [Dozy’s Dog Bed](https://fieldsofmistria.wiki.gg/wiki/Dozy%27s_Dog_Bed), [Temple Flower Seed](https://fieldsofmistria.wiki.gg/wiki/Temple_Flower_Seed), [Valen’s Workstation](https://fieldsofmistria.wiki.gg/wiki/Furniture/Spouse_Items)                                                                                                    | Generated sources say Spring 1; the wiki lists heart-quest, wedding, or gathering sources.                        |
| Mine            | [Void Stone](https://fieldsofmistria.wiki.gg/wiki/Void_Stone)                                                                                                                                                                                                                                                                                                                                                | Generated source restricts it to Ancient Ruins; the wiki lists nodes on any unsealed mine floor.                  |
| Monster         | [Void Powder](https://fieldsofmistria.wiki.gg/wiki/Void_Powder)                                                                                                                                                                                                                                                                                                                                              | Generated source names Void Cat; its wiki drop list does not include Void Powder.                                 |
| Museum          | [Gemstone Bridge](https://fieldsofmistria.wiki.gg/wiki/Gemstone_Bridge)                                                                                                                                                                                                                                                                                                                                      | Generated source requires 22 Archaeology sets; the wiki lists 20.                                                 |
| Quest label     | [Hanging Onion Basket](https://fieldsofmistria.wiki.gg/wiki/Hanging_Onion_Basket), [Champion’s Kitchen](https://fieldsofmistria.wiki.gg/wiki/Champion%27s_Kitchen), [Blueberry Jam](https://fieldsofmistria.wiki.gg/wiki/Blueberry_Jam), [Utensil Holder](https://fieldsofmistria.wiki.gg/wiki/Furniture/Kitchen_Furniture_Set), [Berries and Cream](https://fieldsofmistria.wiki.gg/wiki/Berries_and_Cream) | Wiki acquisition matches the source object; the formatter emits no label.                                         |
| Quest semantics | [Breath of Spring Basket](https://fieldsofmistria.wiki.gg/wiki/Spring_Festival), [Rabbit Plushie](https://fieldsofmistria.wiki.gg/wiki/Animal_Festival)                                                                                                                                                                                                                                                      | Generic quest completion omits placement or contest-prize semantics.                                              |
| Quest trigger   | [Hayden’s Weathervane](https://fieldsofmistria.wiki.gg/wiki/Hayden%27s_Weathervane)                                                                                                                                                                                                                                                                                                                          | Generated source says completion; the wiki says the item is found while the quest is active.                      |
| Renown          | [Maple’s Aldarian Star Drawing](https://fieldsofmistria.wiki.gg/wiki/Maple%27s_Aldarian_Star_Drawing), [Royal Chest](https://fieldsofmistria.wiki.gg/wiki/Royal_Chest)                                                                                                                                                                                                                                       | The wiki lists a heart quest for the drawing & town-rank level 93 for the chest, versus generated renown 10 & 94. |
| Wishing Well    | [Dragon Road Wall](https://fieldsofmistria.wiki.gg/wiki/Wishing_Well), [Water Altar](https://fieldsofmistria.wiki.gg/wiki/Wishing_Well)                                                                                                                                                                                                                                                                      | Generated cost is 100; the wiki lists the 500-cost pool.                                                          |

### Native-evidence dispositions

Each disagreement was reviewed individually. “Unresolved or wiki-stale” deliberately preserves the
generated source: native data either supports it, or does not encode a complete replacement. Wiki
absence alone never removes a native source.

| Case                          | Native evidence inspected                                                                                                                                                                                                                                                                                                                | Disposition                 | Code/test consequence                                                                                                         |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Iron Fish                     | `fiddle/fish.toml` has `iron_fish.rarity = "uncommon"`, `bait_only = true`; `fiddle/items/other/apiaries_and_terrariums.toml` makes the Uncommon/Rare bait ranges overlap at the uncommon boundary.                                                                                                                                      | unresolved or wiki-stale    | Preserve both matching native bait sources; exhaustive source-rendering tests cover the result.                               |
| Silver Squid                  | `fiddle/fish.toml` has `silver_squid.rarity = "uncommon"`, `bait_only = true`; the same native Uncommon/Rare bait boundary is inclusive in `apiaries_and_terrariums.toml`.                                                                                                                                                               | unresolved or wiki-stale    | Preserve both matching native bait sources.                                                                                   |
| Bait Thief                    | `fiddle/fish.toml` has `bait_thief.rarity = "common"`, `retrieval = "fish_trap"`; native trap bait ranges overlap at the common boundary in `apiaries_and_terrariums.toml`.                                                                                                                                                              | unresolved or wiki-stale    | Preserve the native matching set.                                                                                             |
| Blue Crab                     | `fiddle/fish.toml` has `blue_crab.rarity = "common"`, `size = "small"`, `retrieval = "fish_trap"`; native trap bait ranges overlap at the common boundary.                                                                                                                                                                               | unresolved or wiki-stale    | Preserve the native matching set.                                                                                             |
| Hake                          | `fiddle/fish.toml` has `hake.rarity = "uncommon"`, `size = "medium"`, `retrieval = "fish_trap"`; native trap bait ranges overlap at the uncommon boundary.                                                                                                                                                                               | unresolved or wiki-stale    | Preserve the native matching set.                                                                                             |
| Sea Urchin                    | `fiddle/fish.toml` has `sea_urchin.rarity = "uncommon"`, `size = "small"`, `retrieval = "fish_trap"`; native trap bait ranges overlap at the uncommon boundary.                                                                                                                                                                          | unresolved or wiki-stale    | Preserve the native matching set.                                                                                             |
| Gar                           | `fiddle/fish.toml` explicitly has `gar.retrieval = ["fishing", "divespot"]` and `water_type = "river"`.                                                                                                                                                                                                                                  | unresolved or wiki-stale    | Preserve both explicit native retrieval methods.                                                                              |
| Big Cookie                    | `fiddle/letters.toml` entry `adeline_4h_reward_2` grants `big_cookie` when `world_fact_is.adeline_4h_cookie = true`; `fiddle/quests/heart_quests.toml` identifies `a_rewarding_choice` as Adeline's four-heart choice. The runtime edge is not structured.                                                                               | reviewed override           | Replace the false Spring 1 fallback with quest `a_rewarding_choice`, trigger `dialogue_choice`; pin the replacement in tests. |
| Dozy's Dog Bed                | `fiddle/letters.toml` entry `wedding_gifts_juniper` has `requirements.is_spouse = "juniper"` and grants `dozy_pet_bed`.                                                                                                                                                                                                                  | native-confirmed correction | Classify every item from a letter with `requirements.is_spouse` as `wedding`; pin the collector rule in tests.                |
| Temple Flower Seed            | `fiddle/letters.toml` entries `ari_birthday_celine_best_friend` and `ari_birthday_celine_romantic` grant `seed_temple_flower` with `is_player_birthday = true`, Celine heart level 8, and relationship world facts. Birthday letters are not representable by the current source schema.                                                 | unresolved or wiki-stale    | Preserve the existing source pending the predicate/source-tracking follow-up.                                                 |
| Valen's Workstation           | `fiddle/letters.toml` entry `wedding_gifts_valen` has `requirements.is_spouse = "valen"` and grants `valen_workstation`.                                                                                                                                                                                                                 | native-confirmed correction | Covered by the native spouse-letter collector rule; no item-specific override.                                                |
| Void Stone                    | `fiddle/object_prototypes/rock.toml` has `rock_void.drops = [{ item = "void_stone", count = [1, 2] }]`; `fiddle/dungeons/dungeons.toml` places `rock_void` in every biome's `void_rock` table, but does not encode the Void Sight gate.                                                                                                  | unresolved or wiki-stale    | Preserve the reviewed source until a complete location-plus-gate replacement is evidenced.                                    |
| Void Powder                   | `fiddle/monsters/cat.toml` `cat_void.drops` omits Void Powder; `fiddle/misc.toml` only provides `void_powder_chance = 10` with a Void Sight comment and no structured producer.                                                                                                                                                          | unresolved or wiki-stale    | Preserve the reviewed source until the runtime producer can be represented and verified.                                      |
| Gemstone Bridge               | `fiddle/museum_wings/archaeology.toml` places `gemstone_bridge_v1` and its scroll in the 22nd `[[rewards]]` block; its stale `preview_sprite` suffix is `_20`.                                                                                                                                                                           | unresolved or wiki-stale    | Preserve the native reward-array position of 22.                                                                              |
| Breath of Spring Basket       | `fiddle/quests/story_quests.toml` uses `custom.gather.item = "breath_of_spring"` inside the Spring Festival quest; this is placement/gather semantics, not a structured completion reward.                                                                                                                                               | unresolved or wiki-stale    | Preserve the coarse reviewed Spring Festival source pending richer source semantics.                                          |
| Rabbit Plushie                | `fiddle/quests/story_quests.toml` includes `rabbit_plushie` in Animal Festival reward tiers with `required_score = 50` and `65`; score thresholds are not representable by the current quest source.                                                                                                                                     | unresolved or wiki-stale    | Preserve the generated quest source pending contest-threshold tracking.                                                       |
| Hayden's Weathervane          | `fiddle/items/other/misc.toml` has `soulbind = { quest_is_active = "find_the_weathervane" }`; `fiddle/quests/story_quests.toml` requires `has_item = "haydens_weathervane"` during the quest.                                                                                                                                            | unresolved or wiki-stale    | Preserve the reviewed quest source pending an active-quest/found-item trigger.                                                |
| Maple's Aldarian Star Drawing | `fiddle/items/other/misc.toml` says it depicts the Aldarian Star won with Reina; `fiddle/quests/heart_quests.toml` identifies `the_aldarian_cooking_contest` as Reina's eight-heart quest. `fiddle/cutscenes.toml` `mistril_rank` grants only `mistril_star_trophy`, disproving the old renown source; the drawing edge is runtime-only. | reviewed override           | Replace renown 10 with quest `the_aldarian_cooking_contest`, trigger `completion`; pin the replacement in tests.              |
| Royal Chest                   | `fiddle/renown.toml` places `royal_chest_red` at position 94 in the global `rewards` array; the Diamond segment metadata does not provide a contrary level.                                                                                                                                                                              | unresolved or wiki-stale    | Preserve native renown level 94.                                                                                              |
| Dragon Road Wall              | `fiddle/wishing_well.toml` places `dragon_road_wall` in `common.large_roll`; `fiddle/misc.toml` has `wishing_well.high_price = 500` and `low_price = 100`.                                                                                                                                                                               | native-confirmed correction | Read configured roll prices in the item-source collector; test small rolls at 100 and large rolls at 500.                     |
| Water Altar                   | `fiddle/wishing_well.toml` places `dragon_water_altar_v1` and `_v2` in `common.large_roll`; `fiddle/misc.toml` has `wishing_well.high_price = 500`.                                                                                                                                                                                      | native-confirmed correction | The shared collector correction changes both variants to cost 500; focused tests cover the roll-price rule.                   |

## Wiki gaps

Twenty-five sampled rows were unverifiable rather than wrong:

- four artifact pages confirmed dig spots but omitted the exact generated location;
- four dive pages confirmed diving but omitted water type;
- five fishing pages omitted water type;
- five Lost & Found items had no usable row-level wiki evidence;
- three default-source items lacked usable evidence;
- one date photo lacked a page;
- one monster page did not distinguish the generated color variant; and
- two Wishing Well pirate variants were absent from the current table.

The wiki itself says it is still being updated for the August 2026 full release. These rows should
remain native-data review candidates, not pipeline corrections based on silence.

## Missing sources

Every one of the 2,653 generated items & 867 generated recipes has at least one source. No empty
source arrays remain, versus the 635 items & one recipe recorded at the start of issue #78.

This structural success does not prove source completeness. The `default` family, generic quest
semantics, & reviewed overrides still need factual sampling. The current failures are incorrect or
incompletely propagated sources rather than absent arrays.

## Recommendations

1. Normalize quest source metadata to app `QuestType` values & add a generated-data contract test
   that renders every source without throwing or returning `undefined`.
2. Build the production perk lookup by flattening `skills[*].perkTiers`, fix the tier index, & add
   generated-data tests proving every perk-bearing source emits the expected fragment conditions.
3. Project supported progression-bearing `AvailabilityCondition` leaves into item entity visibility
   & store qualifier fragments. Cover quest, perk, mines-level, skill-level, & composite conditions.
   Map resolvable `gamePredicate` leaves such as `seen_cutscene`; retain unsupported predicates such
   as `has_upper_floor` & `is_dating_someone` as availability-only diagnostics for the follow-up
   tracking issue.
4. Correct or explicitly override Void Herb before enforcing the render-all contract.
5. The 21 row-level wiki discrepancies now have case-by-case native-evidence dispositions above.
   Keep unresolved cases in the follow-up tracking issue rather than inferring corrections from wiki
   silence. The five quest-label discrepancies are formatter defects whose underlying source facts
   already match the wiki.
6. Re-run this fixed-seed audit after the blockers are corrected. Preserve “unverifiable” as a
   distinct state so wiki omissions never become synthetic matches.

## Follow-up

Issue #133 (private beta) tracks all 97 deterministic
availability-only records that still use unsupported `has_upper_floor`, `is_dating_someone`,
`reached_date`, unmapped `seen_cutscene`, or `unlocked_animal` predicates. It also carries the
save/backup/transfer compatibility requirements for any new progression state.
