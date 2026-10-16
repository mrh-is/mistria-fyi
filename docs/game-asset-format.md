# Fields of Mistria game asset format

Reference for the structured assets extracted from a Fields of Mistria install, as the pipeline
reads them from `pipeline/input/vX.Y.Z/assets/`. Documented from v1.0.8. It describes structure,
naming, & quirks; it reproduces no game data beyond short illustrative snippets, in keeping with the
repository’s content posture (see [takedown.md](takedown.md)).

The prose here covers what tooling can’t express. Per-file keys, shapes, & pipeline claims come from
the asset atlas script, which regenerates them for any version.

## Checking a version

`pnpm run pipeline:atlas` inventories one version’s assets root into the ignored
`pipeline/output/asset-atlas/`:

```sh
pnpm run pipeline:atlas -- --version=1.0.8
pnpm run pipeline:atlas -- --version=1.0.9 --compare=1.0.8
pnpm run pipeline:atlas -- /path/to/game-files --version=current --out=/tmp/atlas
```

- `vX.Y.Z.md` & `.json` list every file by top-level folder, and each fiddle root’s top-level keys
  with a shape summary, marked with the pipeline modules that reference it.
- `--compare=X.Y.Z` also writes `diff-vA-vB.md` & `.json`: files, fiddle roots, & top-level keys
  added or removed, and keys whose shape summary changed. It compares structure only; a value-only
  change does not appear.
- Claims come from a static scan of `pipeline/src` for dotted fiddle paths (`fiddle.npcs`,
  `"ui.skill_menu.defaults"`, `` `quests.${type}` ``). A claim means a module reaches the file, not
  that it reads every key, and paths built entirely from variables escape the scan.

The game-files root defaults to `pipeline/input`, which holds one `vX.Y.Z/assets` folder per
release. When a newer release lands, run the diff against the documented version, then update this
document only where the diff shows a structural change the prose describes.

Note: older version folders may be partial extractions. v1.0.5 has no `gml/`, so a diff from it
reports all 560 GML files as added; that reflects the extraction tooling, not the game.

## Assets root

| Folder          | Files (v1.0.8) | Format                                          | Pipeline use                    |
| --------------- | -------------: | ----------------------------------------------- | ------------------------------- |
| `fiddle/`       |            299 | TOML game data, one domain per file or folder   | Parsed into the tracker dataset |
| `localization/` |             15 | TOML translation tables per language            | Localized names & UI strings    |
| `gml/`          |            560 | GameMaker Language source for objects & scripts | Cited as provenance, not parsed |
| `tiled/`        |          1,367 | Tiled maps, tilesets, & object templates        | None                            |
| `data_files/`   |             18 | JSON & binary data with `.meta.toml` sidecars   | None                            |
| `etc/`          |              1 | `magic_enums.meta.toml`                         | None                            |

Every folder carries `.meta.toml` files: asset records with a `[meta_properties]` table holding a
16-hex `id` & an `asset_kind` (`Fiddle`, `Gml`, `L10n`, `MistriaRoom`, `GmDataFile`, …). They
describe the asset, not game data.

## Fiddle

### Namespace mapping

Each TOML file under `fiddle/` becomes one dotted root: its directory segments, then its file stem.
The parser merges every root into one tree, skips `.meta.toml` files, and rejects a root that
collides with an ancestor or descendant root.

```text
fiddle/items/other/cooked_dishes.toml  →  items.other.cooked_dishes
fiddle/npcs/holt.toml                  →  npcs.holt
fiddle/dungeons/dungeons.toml          →  dungeons.dungeons
fiddle/fiddle.meta.toml                →  (skipped)
```

v1.0.8 has 298 data files: 68 directly in `fiddle/` and the rest in 12 domain folders, nested at
most two levels deep (`ui/menus/`). A folder’s name repeats when its main file shares it, so the
mine biomes live at `dungeons.dungeons.biomes`.

### File shapes

Files take four common shapes:

1. **Keyed by ID.** Each top-level table is one entity (`items/*`, `achievements`, `letters`,
   `perks`, `player_assets`). Item files group entities by category; the ID is the table name.
2. **One entity per file.** The file stem is the ID and the top-level keys are its fields (`npcs/*`,
   `cameos/*`, `ranching/animals/*`, `museum_wings/*`).
3. **Template plus variants.** A `[default]` table supplies base values that named tables override
   (`monsters/*`, `object_prototypes/*`, `bugs`, `fish`, `festivals`, `cutscenes`, `spells`; 43
   files in v1.0.8). `default` is not an entity; skip it when listing entries.
4. **Configuration.** Flat scalars or a few nested tables (`misc`, `camera`, `kissing`,
   `time_of_day`). Some use arrays of tables (`dungeons.dungeons` has `[[biomes]]`).

An item entry shows the common value conventions:

```toml
[example_statue]
	value = { bin = "self.recipe*1.1" }
	object = "example_statue"
	recipe = [{ count = 10, item = "refined_stone" }, { hours = 0, minutes = 30 }]
```

### Value conventions

- **Expressions.** Prices & some quantities are strings the pipeline evaluates
  (`parse/evaluate.ts`): `self.recipe*1.1` refers to the entry’s own recipe cost, and
  `ore_stone.store * 2` to another item’s field. Spacing around operators varies.
- **Requirements.** Gates appear as inline tables (`requirements = { has_item = "riceball" }`) or
  dotted keys (`requirements.completed_quest = "…"`). `requirements.toml` names the vocabulary
  (`or`, `invert`, `has_perk`, `completed_quest`, `reached_heart_level`, …) as empty tables; its
  operands are defined by usage. One requirement can take a string or a table (`has_item` accepts
  `"item"` or `{ item = 5 }`).
- **Sentinels.** `"<..>"` means “resolve by name” (a location’s `gm_room`), `"<n/a>"` marks a field
  that doesn’t apply in a template, and `-1`, `"MISSING"`, & `"spr_illegal_16"` are placeholders.
  Never surface a sentinel as display text.
- **Units.** Not uniform: `infusions` gives `percentage` as a fraction in some entries & a whole
  number in others. Read each field’s consumers before assuming a unit.

### Domains

“Pipeline” names the modules that read each domain for tracker data, from the v1.0.8 atlas.
Validation, smoke, & helper modules that also touch a domain are omitted.

| Domain              | Files | Holds                                                                                                                                                                                                     | Pipeline                                                        |
| ------------------- | ----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `achievements`      |     1 | Steam achievements, each a requirement expression                                                                                                                                                         | Unclaimed                                                       |
| `activities`        |     1 | NPC activity kinds                                                                                                                                                                                        | Unclaimed                                                       |
| `all_unlocks_facts` |     1 | Unlock flags as booleans                                                                                                                                                                                  | Unclaimed                                                       |
| `artifacts`         |     1 | Dig-site artifact loot by location                                                                                                                                                                        | `collectors/exploration`                                        |
| `barks`             |     1 | Speech-bubble icons & sounds                                                                                                                                                                              | Unclaimed                                                       |
| `bell_sounds`       |     1 | Unlockable bell sounds                                                                                                                                                                                    | Unclaimed                                                       |
| `birds`             |     1 | Wild bird behavior & sprites                                                                                                                                                                              | Unclaimed                                                       |
| `blueprints`        |     1 | Building construction blueprints                                                                                                                                                                          | Unclaimed                                                       |
| `bug_rates`, `bugs` |     2 | Bug rarity weights; bug spawns & behavior                                                                                                                                                                 | `bugs`: `collectors/natural`                                    |
| `cameos`            |     5 | Visiting characters’ portraits & animation                                                                                                                                                                | Unclaimed                                                       |
| `chicken_statue`    |     1 | Chicken statue reward rolls                                                                                                                                                                               | `collectors/rewards`                                            |
| `children`          |     1 | Child characters & thresholds                                                                                                                                                                             | Unclaimed                                                       |
| `cutscenes`         |     1 | Cutscene defaults, given items, & flags                                                                                                                                                                   | `extract/quest-chains`, `collectors/rewards`                    |
| `dates`             |     1 | Date events & rewards                                                                                                                                                                                     | `extract/dates`                                                 |
| `dungeons`          |     6 | Mine biomes, floor ranges, overrides, & decorations                                                                                                                                                       | `extract/mines`, `collectors/exploration`, `collectors/natural` |
| `festivals`         |     1 | Festival calendar                                                                                                                                                                                         | `extract/festivals`                                             |
| `fish`, `fishing`   |     2 | Fish spawns & rarity; fishing tuning & treasure                                                                                                                                                           | `extract/almanac`, `extract/treasure-chest-tiers`               |
| `forageables`       |     1 | Forage by season & rarity                                                                                                                                                                                 | `collectors/natural`                                            |
| `items`             |    95 | Every item: names, values, tags, recipes                                                                                                                                                                  | `extract/almanac`, `assemble`, all collectors                   |
| `letters`           |     1 | Mail triggers, attachments, & requirements                                                                                                                                                                | `extract/quest-chains`, `collectors/rewards`                    |
| `locations`         |     1 | Per-map defaults & flags                                                                                                                                                                                  | `extract/locations`                                             |
| `misc`              |     1 | Global gameplay constants                                                                                                                                                                                 | Several collectors & `main`                                     |
| `misc_local`        |     1 | English UI strings                                                                                                                                                                                        | `localize/ui-strings`                                           |
| `monsters`          |    12 | Monster families, stats, & drops                                                                                                                                                                          | `collectors/natural`                                            |
| `museum_wings`      |     4 | Museum wings & their sets                                                                                                                                                                                 | `extract/museum`                                                |
| `npcs`              |    34 | Villagers: birthdays, gifts, dateability, animation                                                                                                                                                       | `extract/villagers`                                             |
| `object_prototypes` |    10 | Placeable objects, crops, buildings, & furniture                                                                                                                                                          | `acquisition/native-references` (crafting stations)             |
| `perks`, `skills`   |     2 | Perk text & values; skill icons                                                                                                                                                                           | `extract/skills`                                                |
| `pets`              |     1 | Pet jobs & rewards                                                                                                                                                                                        | `extract/pets`                                                  |
| `player_assets`     |     1 | Cosmetics & their unlocks                                                                                                                                                                                 | `extract/cosmetics`                                             |
| `post_process`      |     8 | Lighting curves by zone & weather                                                                                                                                                                         | Unclaimed                                                       |
| `quests`            |    10 | Quest definitions & ordered registries                                                                                                                                                                    | `extract/quests`, `extract/quest-chains`                        |
| `ranching`          |    12 | Animal species, production, & pricing                                                                                                                                                                     | `extract/animals`, `enrich/entity-visibility`                   |
| `renown`            |     1 | Renown ranks & rewards                                                                                                                                                                                    | `extract/renown`                                                |
| `requirements`      |     1 | Requirement vocabulary                                                                                                                                                                                    | `extract/recipes`, `extract/quest-chains`                       |
| `seals`             |     1 | Seal tablets & quest stages                                                                                                                                                                               | Unclaimed                                                       |
| `songs`             |     1 | Collectible songs                                                                                                                                                                                         | Unclaimed                                                       |
| `spells`            |     1 | Spell definitions                                                                                                                                                                                         | `extract/mines`                                                 |
| `stores`            |     1 | Seasonal store stock & gates                                                                                                                                                                              | `extract/stores-meta`, `collectors/stores`                      |
| `ui`                |    32 | Menus, skill trees, crafting layouts, & text styles                                                                                                                                                       | Four roots: `extract/almanac`, `museum`, `skills`, `cosmetics`  |
| `wishing_well`      |     1 | Wishing well reward rolls                                                                                                                                                                                 | `collectors/exploration`                                        |
| Gameplay tuning     |    10 | `full_start`, `gossip`, `grow_back`, `heart_point_values`, `infusions`, `interaction`, `kissing`, `player`, `player_home`, `restoration`                                                                  | Unclaimed                                                       |
| World & schedules   |    12 | `doors`, `hound_help`, `priority_grass`, `priority_objects`, `props`, `routines`, `spouse`, `summit`, `t2_location_descriptions`, `time_of_day`, `weather`, `world_mod`                                   | Unclaimed                                                       |
| Presentation        |    15 | `camera`, `exterior_lights`, `flavor_text`, `fonts`, `footsteps`, `interior_lights`, `lights`, `portrait_fallback`, `rumbles`, `shadows`, `shooting_star`, `tile_cursor`, `tool_fx`, `transparent_assets` | Unclaimed                                                       |

The last three rows group the remaining unclaimed domains by purpose.

### Unclaimed leads

These unclaimed files hold structured data a tracker feature could use:

- `achievements`: each achievement is a requirement expression, so completion could be evaluated
  against imported state.
- `fish` & `bugs` fields beyond the almanac: season, hour, weather, & rarity per entry.
- `songs` & `bell_sounds`: collectible lists, though their unlock sources live elsewhere.
- `children` & `seals`: relationship & story milestones with explicit stages.
- `ui/skill_menu/*`: per-skill perk trees with tier level requirements & essence costs.
- `object_prototypes/building` & `blueprints`: buildable structures & upgrade chains.
- `object_prototypes/crop`: growth stages, regrowth, & seasons for a crop calendar.
- `monsters`: a bestiary checklist with drops (already read for drop sources, not as a list).

## Localization

`localization/` holds `l10n.meta.toml` plus two tables per non-English language, each a `.meta.toml`
whose `[asset_properties]` table maps quoted string keys to strings.

- `translations/<code>.meta.toml` (`asset_kind = "L10nTarget"`) holds the localized text.
- `source_caches/<code>.meta.toml` (`L10nSourceCache`) holds the English each translation was made
  from. The pipeline trusts a translation only when its cached English matches the current English.
- `l10n.meta.toml` lists each language’s display settings, `ship` flag (only English ships; the rest
  are beta), pronoun tables, and the 16-hex IDs of its two tables. Its
  `[asset_properties.fiddle_renames]` maps fiddle path prefixes to the translatable field globs
  (`"items/" = ["*/name", "*/description"]`), the best single source for which fiddle fields are
  localized.

Keys are slash-separated paths, `<category>/<id path>/<field>`: `npcs/holt/name`,
`museum_wings/fish/sets/<set>/name`, `misc_local/<key>`. Dialogue lives under `Conversations/`, the
largest category. English has no table, because fiddle already holds the English text.

Language codes are ISO 639-2 (`fra`, `jpn`, `kor`, `rus`, `spa`) plus `zh-Hans` & `zh-Hant`;
`pipeline/src/localize/locale-codes.ts` maps them to the app’s BCP 47 locales. Strings carry
placeholders (`[Ari]`, `[farm_name]`) and pronoun variants (`<he>…</he><she>…</she><they>…</they>`);
see [localization.md](localization.md) for how the app handles them. Tables use multi-line TOML
strings, so parse them with a TOML parser, never line by line.

## GML

`gml/` holds GameMaker Language source: `objects/` (251 files in 11 subfolders) & `scripts/` (308
files in nine subfolders). Objects are `obj_*` with `par_*` parents; scripts are PascalCase files
(`GrowBack.gml`) defining constructors & functions. Scripts read fiddle through
`fiddle_get("<root>")`, so a fiddle field’s behavior is defined here. File names are not unique
across subfolders.

The pipeline doesn’t parse GML, but reviewed overrides cite GML files as provenance for sources the
TOML doesn’t encode (see `pipeline/src/overrides/sources.ts`).

## Tiled

`tiled/` is a Tiled project: `mistria.tiled-project`, `__gm_import.tsx` (the shared tileset mapping
tile IDs to sprites), `rooms/` (224 `rm_*.tmx` maps with `MistriaRoom` sidecars, in folders named
for places), `templates/` (125 `.tx` object templates), `animations/`, and `tile_sets/`. Maps use
several Tiled format versions.

The project file declares custom property enums, including `LocationId`, whose values are fiddle
location IDs. Room names (`rm_*`) & location IDs don’t correspond one to one: many rooms are
interiors or mine floors with no location entry. Object placements name `obj_*` types, each with a
matching file under `gml/objects/`.

## Data files & etc

- `data_files/animation/` maps sprites to outlines, shadows, tool frames, & player parts (JSON).
- `data_files/room_data/` & `starting_farms/` hold placed-object lists (`object_id` plus tile
  coordinates) for farm expansions & the starting farm, and `terrain.bin`, an undecoded big-endian
  integer grid.
- `etc/magic_enums.meta.toml` lists the enums GameMaker generates from fiddle: `enums_to_generate`
  maps each enum to a fiddle folder or file (`ItemId` to `items/`, `ObjectId` to
  `object_prototypes/`), confirming which fiddle keys act as engine-level IDs.

## ID conventions

- **Fiddle IDs** are snake_case table names or file stems, with no category prefix (`refined_stone`,
  not `item_refined_stone`). Related entries share prefixes (`artifact_replica_*`).
- **NPC IDs** are the lowercase first name & match the file stem under `npcs/`.
- **Quest IDs** are descriptive slugs (`request_for_*`, `*_challenge`); conversation IDs append
  suffixes such as `_turn_in`.
- **GameMaker names** use prefixes: `obj_` & `par_` objects, `spr_` sprites, `rm_` rooms, `fnt_`
  fonts.
- **Localization keys** are fiddle paths with `/` separators, plus a field name.
- **Asset IDs** in `.meta.toml` are 16-hex strings; the localization manifest’s IDs change when a
  table is regenerated, which makes them cheap change fingerprints.

## Quirks

- Display names repeat across distinct IDs (several quests share one name), so key by ID, never by
  name.
- Preserved misspellings are real keys: `grow_back` uses `elligible_objects`.
- Some files are empty or nearly so: `items/furniture/misc.toml` is one byte, and
  `unreviewed_new_items.toml` holds an item its own comment says isn’t in the game.
- The same name can mean different things in different folders: `cooking` exists in both
  `ui/crafting/` & `ui/skill_menu/`. Join on fields (`skill`), not file names.
- A field’s type can vary by entry: `restore` is a string or an integer, and `portrait_fallback`
  values are strings or inline tables.
- Quote style & indentation vary between files (single-quoted keys with slashes in
  `all_unlocks_facts`), which matters only to line-based tools; always use a TOML parser.
