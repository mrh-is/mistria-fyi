# Issue 78 source audit

**Date:** August 15, 2026

**Worktree:** `.worktrees/78-complete-sources`

**Branch:** `78-complete-sources`

This ledger records research for issue #78. It is evidence and a handoff aid, not an exclusion list
or a substitute for pipeline validation.

## Baseline

The committed v1.0.2 tracker data has:

- 635 items without a source;
- one recipe without a source: `kitchen_salt_and_pepper_shakers`;
- 171 locked cosmetics without a source, out of 298 locked cosmetics; and
- 127 entries in the current top-level source index.

Missing items by category:

| Category         | Count |
| ---------------- | ----: |
| furniture        |   308 |
| other            |   133 |
| artifacts        |   104 |
| forageables      |    27 |
| ranching         |    27 |
| materials        |    13 |
| blacksmithing    |    12 |
| date inspiration |     5 |
| crops            |     4 |
| cooked dishes    |     1 |
| song crystal     |     1 |

Of the 635 missing items, 48 already reference a tracked recipe and 587 do not. 141 appear in a
museum set. Regenerate these counts after every collector tranche.

## Confirmed native source families

| Family            | Native evidence                                                        | Notes                                                                                                                                             |
| ----------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stores            | `fiddle.stores.stocks`                                                 | Inspect constant, seasonal, random, requirement-gated, item, cosmetic, and scroll stock independently. Louis has year-round and seasonal paths.   |
| Recipes           | item `recipe`, `recipe_is_default`, and recipe tags                    | Every recipe member needs a production source referencing the canonical recipe. Default applies to the recipe, not automatically to its products. |
| Quests            | `fiddle.quests.*.rewards[]`                                            | Extract both `item` and `player_cosmetic`. Do not confuse requested or supplied items with rewards.                                               |
| Quest cutscenes   | `fiddle.cutscenes.*.given_items`                                       | A mechanical scan found 24 currently unsourced item references. Each must be joined to its actual trigger before extraction.                      |
| Letters           | `fiddle.letters`                                                       | Preserve donation, shipment, and reached-date triggers.                                                                                           |
| Renown            | `fiddle.renown`                                                        | Extract item, cosmetic, and recipe rewards with the exact town-rank level.                                                                        |
| Museum            | `fiddle.museum_wings`                                                  | Extract item, cosmetic, and recipe rewards. Explorer Boots are an archaeology reward.                                                             |
| Monsters          | `fiddle.monsters.*.*.drops[]`                                          | Extract item and cosmetic drops plus native chance or weight. Griffin Hat is a confirmed example.                                                 |
| Fishing treasure  | `fiddle.fishing.chest_tables`                                          | Extract item and recipe entries by chest tier. Tiny and small essence stones are currently missing.                                               |
| Mine biomes       | `fiddle.dungeons.dungeons.biomes[]`                                    | Inspect every loot key, including `armor`. Five armor families comprise 30 item IDs, six per biome.                                               |
| Artifacts         | `fiddle.artifacts.loot`                                                | Covers artifact digging pools. The exact emitted set is 104 artifacts; a string-reference heuristic found only 79 and is not authoritative.       |
| Artifact replicas | `fiddle.items.furniture.artifact_replica_set` and artifact IDs         | There are 105 replica furniture items. Prove `artifact_replica_<artifact-id>` resolves exactly. The replicator unlocks after any one museum set.  |
| Pumpkin patch     | `fiddle.misc.pumpkin_patch_options`                                    | The Harvest Festival purchase costs 200 tesserae and returns one random entry. The exact option count is 30.                                      |
| Proposal items    | `fiddle.items.other.10_heart_special_items` and cutscene `given_items` | Each candidate presents their unique item when proposed to while dating at ten hearts. Twelve mappings were found.                                |
| Dates             | dating items with `date_unlock`, joined to `fiddle.dates.*.photo_item` | The first date of a type with a person awards its photo. Six date types are currently unlockable; nine photo IDs exist in data.                   |
| Earthly Essence   | perk data and `fiddle.misc.earthly_essence`                            | Crop harvests may drop a Magic Seed. Its seasonal result table requires full availability conditions.                                             |
| Default cosmetics | `fiddle.player_assets.*.default_unlocked`                              | Assets marked true are available from the start. Vera-sold alternatives remain store sources.                                                     |

## Confirmed reviewed overrides

- `void_cake`: a conditional dialogue reward in “The Dragonsworn Tablet”, obtained by repeatedly
  refusing to raise friendship with Eiland when speaking to the Priestess.
- Dragon Cleric Diadem, Earrings, Robe, Boots, and Cape: Ritual Chamber rewards that require the
  Lost to History perk. The six `ritual_*` artifacts share the chamber mechanic. No complete native
  acquisition table has been found.

## Specific researched cases

- Scrap Metal armor is in upper-mines chests through the biome `armor` field. Other biome loot
  fields need the same general collector.
- Ancient Gold Coin is in artifact loot tables and can be found while digging.
- Town rank 91 gives the bronze Hero Shield and its recipe. Other colorways, including gold, need
  production sources referring to that recipe.
- The Pine Sapling recipe is default. The sapling itself is made at the mill.
- Crops have a low Magic Seed drop chance with Earthly Essence. The planted seed produces a
  season-dependent random entry from the native table.
- Fish traps need the repaired-beach-bridge gate. Summit, Beach Cave, Western Ruins, and Deep Woods
  acquisition paths also need their area restrictions preserved.
- Wedding assets and first-date photo awards require event sources rather than defaults.
- `kitchen_salt_and_pepper_shakers` is the sole recipe gap and needs research, not a fallback.

## Cosmetic audit

A TOML-structured delegated audit mapped 352 of 389 cosmetics to at least one native family:

| Family                                    | Count |
| ----------------------------------------- | ----: |
| `player_assets.default_unlocked`          |    91 |
| store stock                               |    96 |
| `player_assets.price_override` candidates |    26 |
| equipment `cosmetic_to_unlock`            |    44 |
| renown rewards                            |    22 |
| museum rewards                            |    20 |
| dungeon biome cosmetics                   |    17 |
| monster drops                             |    15 |
| wedding assets                            |    11 |
| festival rewards                          |     9 |
| Earthly Essence and Mist Sight tables     |    18 |
| fishing treasure                          |     5 |
| quest `player_cosmetic` rewards           |     2 |
| Wishing Well                              |     2 |

Families overlap. `price_override` alone is evidence of a configured price, not necessarily the
store path; join it to stock data before emitting a source.

The 37 unresolved cosmetic IDs form four review groups:

- 24 `baby_back_*` held-baby assets have only name, lookup table, and UI slot fields. No player
  unlock reference was found; these are likely internal presentation assets and need exclusion
  evidence.
- five `*_seridia` Dragonsworn armor assets occur in `misc.seridia_armor`, an NPC outfit list rather
  than a player acquisition path. They need exclusion evidence.
- five Dragon Cleric assets match the Lost to History Ritual Chamber override.
- `back_gear_march_mistrian_shield` appears related to the ten-heart placeable item but has no
  cosmetic unlock path; `head_flower_hat` and `head_mimic_hat` also remain unresolved. Check the
  wiki and broader event data before excluding any of these three.

The two exact quest cosmetic rewards are `head_special_flower_crown` and
`back_gear_dragonsworn_cloak`. The two Wishing Well cosmetics are `head_teapot` and `head_soup_pot`.

- The wiki identifies `head_mimic_hat` as a reward for feeding Mimics in the Mines. This requires a
  distinct `monster_feed` source because it is not a drop.
- The wiki lists `head_flower_hat` under “Unknowns” with no acquisition details, strengthening an
  unreleased/internal exclusion case but not proving it alone.
- The wiki describes March’s proposal furniture item `marchs_mistrian_shield`; it does not establish
  an unlock for the separate `back_gear_march_mistrian_shield` cosmetic. Keep it unresolved.
- `kitchen_salt_and_pepper_shakers` is sold in the Inn’s constant stock and has a crafting recipe,
  but neither native data nor the wiki result established how the recipe unlocks. Keep it
  unresolved.

## Research cautions

- Text presence is not proof of acquisition. Quest requests, ingredients, declarations, and
  prototypes produced false positives in mechanical scans.
- A broad `misc.toml` scan incorrectly classified 62 records as pumpkin-patch results; the exact
  `pumpkin_patch_options` array contains 30.
- A key/value scan found 79 artifacts, while the canonical emitted registry contains 104. Parse the
  structured loot tables instead of trusting string matches.
- The 24 currently unsourced `cutscenes.given_items` references mix several mechanics. Join each
  cutscene to its quest, relationship event, or starting-state trigger before generating sources.

## Resume checklist

1. Re-run the missing-source audit after each extraction tranche and append exact remaining IDs.
2. Add unresolved IDs only to a reviewed research table with checked native paths and wiki pages.
3. Never emit an `unknown` or `unobtainable` source to satisfy validation.
4. Run the complete verification matrix before each commit.
5. Regenerate `src/lib/data/tracker-data.json` only through the pipeline.
