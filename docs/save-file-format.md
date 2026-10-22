# Fields of Mistria save file format

Reference for the `.sav` file format used by Fields of Mistria. Documented from a v1.0.2 save file;
earlier versions use the same binary container but may differ in JSON schemas.

A reference save file, its unpacked JSON representation, and a field-level schema breakdown live in
the private `mistria-fyi-private` repository at `pipeline/input/save/`, not in this repository’s
`pipeline/input`. For the game’s extracted data files, see
[game-asset-format.md](game-asset-format.md).

## Binary container

A `.sav` file is a raw **deflate**-compressed binary blob (not gzip, not zip). Decompress with
`DecompressionStream("deflate")` in the browser or `zlib.inflateSync()` in Node.

### Decompressed layout

All integers are unsigned 64-bit little-endian (`u64 LE`). Strings are UTF-8.

```
┌──────────────────────────────────────────────────────┐
│ u64 LE   entry_count                                 │
├──────────────────────────────────────────────────────┤
│ repeated entry_count times:                          │
│   u64 LE   name_length                               │
│   bytes    name (UTF-8, name_length bytes)           │
│   u64 LE   data_length                               │
│   bytes    data (UTF-8 JSON, data_length bytes)      │
├──────────────────────────────────────────────────────┤
│ (end of file)                                        │
└──────────────────────────────────────────────────────┘
```

Each entry's data payload is a self-contained JSON object. Entry names are unique within a save.

### Size profile (v1.0.2 late-game save)

Compressed on disk: ~290 KB. Decompressed: ~3.1 MB across 42 entries. The largest entries are
`game_stats` (~1.3 MB), `gamedata` (~610 KB), `farm` (~330 KB), and `player` (~230 KB). Most
location entries (seals, player home rooms) are under 1 KB.

The checked-in fixture is exactly 298,271 bytes compressed and 3,216,869 bytes decompressed. The
browser importer caps input at 8 MiB and expanded output at 64 MiB, leaving more than 20x headroom
over this measured late-game save while bounding memory use on constrained devices.

## Entries

A save contains a mix of **global state entries** and **per-location entries**. The importer only
needs the global state entries; location entries store placed objects, villager positions, and
similar scene data.

### Global state entries

These are the entries relevant to progress tracking:

| Entry        | Description                                                         |
| ------------ | ------------------------------------------------------------------- |
| `player`     | Player identity, inventory, unlocks, skills, relationships          |
| `gamedata`   | World-level state: calendar, museum, mines, villager facts, weather |
| `quests`     | Quest journal: active, completed, request board                     |
| `header`     | Summary metadata: player name, farm name, playtime, appearance      |
| `info`       | Save format version (`creation_version`, `version`)                 |
| `game_stats` | Detailed gameplay statistics (largest entry; not used by tracker)   |
| `villagers`  | Per-Villager state: schedules, gift history, dialogue flags         |

### Per-location entries

Everything else: `farm`, `town`, `beach`, `narrows`, `eastern_road`, `deep_woods`, `western_ruins`,
`haydens_farm`, `mines_entry`, `summit`, `dragonsworn_glade`, player home rooms (`player_home`,
`player_home_north`, `player_home_east`, etc.), seal rooms (`ruins_seal`, `water_seal`,
`earth_seal`, `fire_seal`, `void_seal`), secret areas (`beach_secret`, `narrows_secret`,
`priestess_quarters`), `date_photos`, and `DynamicGrid_*` entries.

---

## `player` entry

The player entry contains all per-player progression data. Key fields for the tracker:

### Items & almanac

| Field             | Type                     | Description                                                  |
| ----------------- | ------------------------ | ------------------------------------------------------------ |
| `items_acquired`  | `string[]`               | Item IDs the player has picked up at least once              |
| `items_sold`      | `Record<string, number>` | Sale count per item ID; the game stores a `0` for every item |
| `recipes_created` | `string[]`               | Item IDs the player has crafted at least once                |

All three use **item IDs** (e.g. `"apple_pie"`, `"axe_copper"`). Only `items_acquired` represents
the almanac: the game's almanac counts nothing else. `items_sold` starts as a zero-filled array over
every item, so its keys say nothing about discovery. `recipes_created` can name an item that was
never marked acquired, which the game's almanac still shows as locked.

Acquiring an item marks every item with the same `recipe_key` acquired (`mark_item_as_acquired` in
`Ari.gml`), and the almanac shows one entry per `recipe_key` (`AlmanacMenu.gml`). An item without a
`recipe_key` uses its own ID.

### Recipe unlocks

| Field                    | Type       | Description                                     |
| ------------------------ | ---------- | ----------------------------------------------- |
| `recipe_unlocks`         | `string[]` | Recipes the player currently owns               |
| `morning_recipe_unlocks` | `string[]` | Recipes queued for the morning unlock animation |

Both arrays contain a **mix of recipe IDs and item IDs**. The game stores recipe unlocks at the
item-variant level for recipes with multiple outputs (e.g. `"animated_waterfall_v1"` and
`"animated_waterfall_v2"` rather than just `"animated_waterfall"`), but uses the recipe ID directly
for single-output recipes.

To resolve these to recipe IDs: check if the string is a known recipe ID first; if not, look up the
item and use its `recipeId` field.

`morning_recipe_unlocks` is nearly identical to `recipe_unlocks` but may contain non-recipe items
(e.g. `"void_set_scroll_bundle"`, the scroll bundle item itself rather than any recipe it unlocks).
Use `recipe_unlocks` as the authoritative source.

Fixed recipe-scroll grants have an additional gap: the Engagement Ring can be absent from
`recipe_unlocks` after its scroll was acquired & used. Native `LearnRecipe` handles `set_unlock`
scrolls by matching product tags, then calls `Ari.unlock_recipe`. Proposing intentionally clears
`ARI.recipe_unlocks[ItemId.EngagementRing]` in `AriUtils.gml`, so later saves no longer list it as
currently available. The pipeline derives each fixed scroll’s deduplicated recipe IDs as
`Item.recipeUnlocks` and throws if its native set has no matching recipe. Import unions those grants
from `items_acquired`, covering every fixed scroll & bundle without inferring learning from an
output item. Generic recipe scrolls have a runtime inner-item target; acquiring the generic scroll
ID alone cannot identify that recipe, so their saved recipe unlocks remain authoritative. Both
`items_acquired` and `recipe_unlocks` must be readable for learned-recipe extraction to be complete;
missing, malformed, or unknown acquisition evidence still adds readable grants but leaves the
field’s completeness unknown.

### Cosmetics & variants

| Field                        | Type                       | Description                               |
| ---------------------------- | -------------------------- | ----------------------------------------- |
| `cosmetic_unlocks`           | `string[]`                 | Player cosmetic IDs unlocked              |
| `animal_variant_unlocks`     | `Record<string, string[]>` | Per-animal variant IDs (keyed by animal)  |
| `animal_cosmetic_unlocks`    | `Record<string, string[]>` | Per-animal cosmetic IDs (keyed by animal) |
| `pet_skin_unlocks`           | `string[]`                 | Pet skin IDs                              |
| `pet_cosmetic_sets_unlocked` | `string[]`                 | Pet cosmetic set IDs                      |
| `seen_cosmetics`             | `string[]`                 | Cosmetics the player has viewed in the UI |

The Mistmare’s appearances share the horse’s list: `animal_variant_unlocks.horse` holds breeds and
mount appearances (`giant_chicken_white` & `giant_chicken_gold`, from the Big Egg) side by side, so
the import routes an ID to mount appearances when it isn’t a horse breed. The default `mistmare`
appearance never appears there; the import infers it from `gamedata.scene_history` (below).

Starting player cosmetics can be absent from `cosmetic_unlocks`; import unions every cosmetic with a
native `default` source into the saved unlocks. It also seeds animal variants with a `default`
source, matching the normal `NewGame` branch’s `default_unlocked` initialization, even if the saved
variant list is absent. These defaults represent unlocked appearances, not owned animals. Default
recipes were already credited independently of `recipe_unlocks`.

The default-source audit covers the other tracked domains too. Animal cosmetics, pet cosmetic sets,
pet skins, mount appearances, dates, spells, and perks have no starting-default grants in their
current extractors. Almanac items still require `items_acquired`: an item’s `default` source can
describe a story/world object or acquisition path, rather than an item the player has acquired, so
it must not automatically mark an almanac entry discovered. Museum donations likewise require save
evidence.

### Skills & spells

| Field            | Type                     | Description                                              |
| ---------------- | ------------------------ | -------------------------------------------------------- |
| `skill_xp`       | `Record<string, number>` | XP totals per skill (not levels; levels are in gamedata) |
| `spells_learned` | `string[]`               | Spell IDs the player has unlocked                        |
| `perks`          | `string[]`               | Perk IDs the player has selected                         |

### Other notable fields

| Field                   | Type                  | Description                             |
| ----------------------- | --------------------- | --------------------------------------- |
| `name`                  | `string`              | Player character name                   |
| `farm_name`             | `string`              | Farm name                               |
| `birthday`              | `number`              | Player's birthday (calendar day number) |
| `inventory`             | `array`               | Current inventory slots                 |
| `inbox`                 | `array`               | Mailbox messages                        |
| `legendary_fish_caught` | `string[]`            | Legendary fish IDs                      |
| `date_history`          | `array`               | Date event history                      |
| `date_unlocks`          | `string[]`            | Unlocked date types                     |
| `song_unlocks`          | `string[]`            | Song IDs for the music box              |
| `quest_artifacts`       | `Record<string, ...>` | Special quest item state                |
| `pronouns`              | `object`              | Player's pronoun configuration          |
| `stats`                 | `object`              | Aggregate gameplay statistics           |

### Household fields

| Field               | Type             | Description                                                               |
| ------------------- | ---------------- | ------------------------------------------------------------------------- |
| `proposal_date`     | `number \| null` | Calendar time of the accepted proposal; `null` before one                 |
| `wedding_date`      | `number \| null` | Calendar time of the wedding; `null` before one                           |
| `pending_child`     | `object \| null` | `{ due_date, utero }` while a child is on the way, else `null`            |
| `children`          | `array`          | One entry per child born                                                  |
| `disable_break_ups` | `boolean`        | Keep other dating relationships when getting engaged; defaults to `false` |

The importer reads `disable_break_ups` as the household setting `breakUpsDisabled`. In v1.0.8,
`process_proposal` in `AriUtils.gml` changes other dating NPCs to `best_friend` and sets
`{npc}_is_ex` only when break-ups are enabled. Marriage itself changes no other relationships. The
game locks the setting after engagement; the tracker leaves it editable so players can correct older
imported progress. `disable_break_up_letters` suppresses letters only, not status changes. No v1.0.8
GML implements divorce.

A non-null `pending_child` or non-empty `children` array means the household chose children
(`childChoice: "yes"`). Choosing no children leaves no trace, so a childless save reads as
`"undeclared"` & the child choice is never complete. The dates aren’t tracked; who the player
proposed to or married comes from the status flags in `t2_world_facts` (below).

---

## `gamedata` entry

World-level state shared across all save slots.

### Fields used by the tracker

| Field                 | Type                      | Description                                                |
| --------------------- | ------------------------- | ---------------------------------------------------------- |
| `maximum_mines_level` | `number`                  | Zero-based deepest mines floor index (add one for display) |
| `museum_progress`     | `string[]`                | Item IDs donated to the museum                             |
| `scene_history`       | `string[]`                | Cutscene IDs played; `reveal_mistmare` grants the Mistmare |
| `t2_world_facts`      | `Record<string, unknown>` | Large key-value store for world state (below)              |

`maximum_mines_level` stores `MAXIMUM_REACHED_DUNGEON_LEVEL` directly. The elevator menu and the
game’s `ReachedMinesLevel` requirement both add one, so stored `99` imports as floor 100. Ordinary
new-game initialization sets zero; `DungeonRunner` updates it with the maximum of its previous value
and the current zero-based floor, so entering floor one leaves zero unchanged. The importer follows
the elevator’s semantics and maps an explicitly present valid zero to floor one, even when the mines
have never been entered. A missing or invalid field remains unset. The `ALL_UNLOCKS` debug branch
initializes 100; import clamps it, and any larger index, to the tracker’s maximum floor.

### `t2_world_facts`

A flat key-value map (~8,700+ entries in a late-game save) encoding most of the game's persistent
world state. Keys follow naming conventions:

- **`{npc_id}_heart_level`** → `number`: Villager relationship level (0–10+)
- **`{skill_id}_level`** → `number`: Skill level
- **`renown`** → `number`: Player's renown level
- **`{npc_id}_status`** → `string | undefined`: the relationship status, `best_friend`, `dating`,
  `fiance`, or `spouse`. `Npc.report_relationship` mirrors it into `{npc_id}_is_best_friend`,
  `_is_dating`, `_is_fiance`, & `_is_spouse` (`0`/`1`), plus `has_spouse` & `has_fiance`. The
  importer reads the flags as platonic, romantic, proposed, & married. A spouse takes precedence
  over a stale dating flag for the same villager. Other dating relationships remain as stored; the
  v1.0.8 married save has break-ups disabled and retains seven other partners. No v1.0.8 script
  writes `ari_is_married` or `ari_is_engaged`, so the importer ignores them.
- **Various flags** → `boolean | number | string`: quest triggers, event flags, world unlocks

### Other `gamedata` fields

| Field                     | Type      | Description                                   |
| ------------------------- | --------- | --------------------------------------------- |
| `clock`                   | `number`  | Current time of day                           |
| `date`                    | `number`  | Current calendar date                         |
| `weather`                 | `object`  | Current weather state                         |
| `daycare`                 | `array`   | Animals in the daycare                        |
| `seals`                   | `object`  | Seal room puzzle state                        |
| `saturday_market_vendors` | `array`   | Current Saturday market vendor lineup         |
| `farm_expanded`           | `boolean` | Whether the farm expansion has been purchased |
| `all_unlocks`             | `boolean` | Debug/cheat flag for all unlocks              |
| `pet`                     | `object`  | Pet species, name, and state                  |
| `props`                   | `object`  | Placeable prop state                          |

---

## `quests` entry

| Field                        | Type                            | Description                           |
| ---------------------------- | ------------------------------- | ------------------------------------- |
| `active_quests`              | `{ quest_name: string, ... }[]` | Currently active quests               |
| `completed_quests`           | `string[]`                      | Quest IDs that have been finished     |
| `completion_timestamps`      | `Record<string, number>`        | When each quest was completed         |
| `request_board`              | `array`                         | Current request board postings        |
| `request_board_read_entries` | `string[]`                      | Request board entries player has seen |
| `blackboard`                 | `object`                        | Blackboard quest state                |
| `manual_quest_unlocks`       | `string[]`                      | Quests unlocked outside normal flow   |

Older saves can have passed several town ranks before the “Reach … Town Rank” quests were added,
leaving only a later rank’s completion recorded. Import uses `t2_world_facts.renown` to complete
every rank quest at or below that level. The pipeline derives `StoryQuest.townRankLevel` from its
native stage’s `reached_renown_level` requirement and validates it against the extracted town-rank
boundaries; missing, unmatched, or additional objectives fail extraction. Explicit journal
completions & true `quest_<id>_complete` facts remain additive, even above the imported rank.
Malformed renown never infers completion, and incomplete evidence keeps quest extraction unknown.
This inference applies to native save import; manually editing renown does not change quest state.

---

## `header` entry

Summary data used by the game's save slot picker. Contains `name`, `farm_name`, `playtime` (in
seconds as a float), `calendar_time`, `clock_time`, and `preset` (player appearance).

## `info` entry

Save format metadata:

```json
{
  "creation_version": { "major": 0, "minor": 11, "patch": 7, "pre": null },
  "last_played": 46245.248,
  "version": { "major": 1, "minor": 0, "patch": 2, "pre": null }
}
```

`creation_version` is the game version when the save was first created. `version` is the game
version that last wrote to the save. `last_played` appears to be a day-precision timestamp.

---

## ID conventions

The game uses snake_case string identifiers throughout. IDs are generally stable across game
versions, though new items, recipes, and quests are added in content updates.

- **Item IDs** identify specific item variants: `"apple_pie"`, `"animated_waterfall_v1"`
- **Recipe IDs** identify crafting recipes, which may produce multiple item variants:
  `"animated_waterfall"` covers both `v1` and `v2`
- **Villager IDs** are lowercase names: `"juniper"`, `"hayden"`, `"celine"`
- **Skill IDs**: `"farming"`, `"mining"`, `"cooking"`, etc.
- **Quest IDs**: `"main_quest_1"`, `"deliver_hayden_seeds"`, etc.

## Notes for the importer

1. Use `recipe_unlocks` (not `morning_recipe_unlocks`) as the source for recipe tracking.
2. Recipe unlock IDs need resolution: some are recipe IDs, some are item IDs. Look up items by their
   `recipeId` field to normalize.
3. `items_acquired` alone forms the almanac; ignore `items_sold` and `recipes_created` for it.
4. `t2_world_facts` villager heart levels are floats in practice; floor them for display.
5. Skill levels come from `t2_world_facts`, not `skill_xp` (which stores raw XP).
6. Every heart & skill level key is present in v1.0.8 saves, early & late, so a missing one means
   the save is incomplete for that field, not that the level is zero.
7. Saves list game IDs the tracker deliberately doesn't track: items outside the almanac, the
   cosmetic token items (`cosmetic`, `animal_cosmetic`, `pet_cosmetic`), treasure chests
   (`treasure_box_<tier>`, tracked as chest tiers). The importer counts these as
   known-but-untracked; anything else it doesn't recognize marks its field incomplete. The
   Mistmare's perks (`horsepower`, `harvest_horse`, `nice_ride`) share `perks` with the skill perks
   and import into the same `unlockedPerks` set.
8. A farm's identity is the number in `game-<number>-<autosave or slot>.sav` plus
   `info.creation_version`. Both are optional when importing: renamed files, extracted JSON, & old
   saves may omit them. `header.playtime` only grows as the save is played. The manual importer also
   reads player/farm names from `player` (or `header` when absent) for display; renaming them does
   not change identity. These display names never enter the feedback progress attachment.
