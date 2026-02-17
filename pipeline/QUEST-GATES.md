# Quest Gate Research Notes

This document captures the prerequisite research that informed the pipeline changes for quest-
locked items. It focuses on the fields available in `pipeline/input/fiddle.json` and the
human-readable output in `pipeline/output/fiddle-readable.json`.

## Core Signals Found

### Progression flags on animals

Animals are gated by progression flags in ranching data:

```
$.ranching.animals.{animal}.core.progression_requirement
```

Example: duck/alpaca/sheep/capybara/horse/rabbit require `repaired_haydens_farm`.

### Progression flags on request board quests

Request board quests include `required_progression_flag` values. These are not direct quest
definitions, but they indicate which progression flags gate related content.

Example flags observed:

- `open_mines`
- `break_water_seal`
- `break_earth_seal`
- `repaired_haydens_farm`
- `coop_built`
- `barn_built`

### Store stock gating

Store stock entries can include:

- `quest_is_completed`: gate directly by quest ID
- `progression`: gate by progression flag

Examples:

- `wildberry_pie` in store stock gated by `progression: wildberry_pie`
- `twice_baked_rations` gated by `progression: twice_baked_inn_stock`

### Cutscenes that unlock progression flags

Cutscenes include `progression_unlocks`, which emit progression flags that unlock content. These can
be linked back to quests via quest stage queries or cutscene-related conversations.

Key examples:

- `repair_haydens_barn_pt_2` → `repaired_haydens_farm`
- `repair_the_bridge_pt_2` → `saturday_market_unlocked`
- `unlocking_the_mines_pt_2` → `open_mines`
- `break_fire_seal` → `break_fire_seal`

Some cutscenes trigger via quest stage `queries.cutscene`. Others are paired with quest turn-in
conversations that follow the pattern:

```
<cutscene_id>_turn_in
<cutscene_id>_turn_in_complete
```

### Quest rewards unlock progression flags

Story quests can emit progression flags via rewards:

```
$.quests.story_quests.{quest}.rewards[].unlock
```

Examples:

- `repair_the_bridge` → `saturday_market_unlocked`
- `replenishing_mistrias_food_reserves_2` → `twice_baked_inn_stock`
- `unlocking_the_mines_pt_2` → `open_mines`

### Spells unlocked by cutscenes

Spells are not marked in the spell data, but cutscenes can unlock them:

```
$.cutscenes.{cutscene}.spell_to_unlock
```

Example:

- `break_fire_seal` cutscene unlocks `fire_breath`

The quest linkage here is via `quest_to_progress` on the cutscene.

## Mapping Strategy Implemented

1. Build quest lookup tables from quest stages:
   - `cutscene_id` → quest ID
   - `npc_conversation` → quest ID
2. Derive `progression_flag` → quest ID mappings:
   - Cutscenes with `progression_unlocks`
   - Quest rewards with `unlock`
3. Gate items, animals, and spells:
   - Animals use `core.progression_requirement`
   - Store items use `quest_is_completed` or `progression`
   - Spells use cutscene `spell_to_unlock`
4. Emit `questGate` lists on gated entities and a top-level `questGates` index.

## Known Gaps

1. Some progression flags are emitted without a quest reference (example: `break_water_seal` and
   `break_earth_seal` cutscenes don't include quest metadata directly). These may require linking
   via additional quest/cutscene metadata not yet mapped.
2. Request board quests are gated by progression flags but are currently out of scope for emitting
   `questGate` data because request board entries are not tracked as items.
3. Additional gating systems may exist in other data sections beyond the ones explored above.
