# Animal cosmetic sources & pet collectibles

Addresses [#107](https://github.com/mrh-is/harvest-helper/issues/107).

## Problem

The animals page tracks ranching animal cosmetics (115 entries across 8 species) but shows no
acquisition sources. The TOML data encodes where these cosmetics come from (stores, chicken statue,
festivals, quests, breeding), but the pipeline collectors skip `animal_cosmetic` entries because
they only match on `item` or `cosmetic` (player cosmetics).

Separately, two pet collectible categories have no tracker representation at all:

- **Pet cosmetics** (12 cosmetic sets in `pets.toml`, 177 individual sprite entries). Each set
  applies to both cat and dog; unlocking a set unlocks the cosmetic for both pets at once. The
  unlock items come from the chicken statue and monster drops.
- **Pet skins** (14 skins in `items/other/monster_drops.toml`). Each is a monster drop item with a
  `pet_skin_unlock` field. Skins apply to both cat and dog.

## Design

### 1. Ranching animal cosmetic sources

#### Data contract

Make `AnimalCosmetic` extend `TrackerEntity` and drop `fullName` (it's trivially synthesized as
`"${speciesName} ${name}"` at display time):

```typescript
export interface AnimalCosmetic extends TrackerEntity {
  name: string;
}
```

This gives animal cosmetics `sources: SourceTuple` and `visibility?: VisibilityCondition` for free,
matching the pattern used by `Cosmetic`, `Item`, `Recipe`, etc.

#### Source accumulator

Create `AnimalCosmeticSourceAccumulator` with a composite key type `AnimalCosmeticKey`
(`"${AnimalId}:${CosmeticId}"`). The accumulator decomposes keys back to `(animalId, cosmeticId)`
pairs when attaching sources to `trackerData.animals[animalId].cosmetics[cosmeticId]`.

#### Collector changes

Six sources exist in the TOML data:

| Source              | File                       | Entry shape                                                        | Count |
| ------------------- | -------------------------- | ------------------------------------------------------------------ | ----- |
| Store (Hayden's)    | `stores.toml`              | `{ animal, animal_cosmetic, requirements? }`                       | ~25   |
| Chicken statue      | `chicken_statue.toml`      | `{ animal, animal_cosmetic, requires? }`                           | ~16   |
| Festivals (stock)   | `festivals.toml`           | `{ animal, animal_cosmetic, has_unlocked_animal?, tier_required }` | ~16   |
| Festivals (prizes)  | `misc.toml`                | `{ placeable, cosmetic }` (ribbon cosmetics)                       | ~24   |
| Quests              | `quests/story_quests.toml` | `{ animal, animal_cosmetic }`                                      | 2     |
| Breeding (seasonal) | `ranching/animals/*.toml`  | `variants.{season}.default_cosmetic`                               | ~32   |

Each source needs a collector branch:

- **`stores.ts`**: When an entry has `animal_cosmetic` and `animal`, emit a `store` source into the
  animal cosmetic accumulator using the composite key. Requirements handling stays the same.
- **Chicken statue loot** (`chicken_statue.toml`): The `common.small_roll` array mixes items, recipe
  scrolls, animal cosmetics, and pet cosmetics. Items and recipe scrolls are already collected
  (items by an existing collector, recipe scrolls by the recipes extractor). Animal cosmetics and
  pet cosmetics are silently skipped. Add a new collector function (in `rewards.ts`) that iterates
  the chicken statue roll tables and emits `chicken_statue` sources for `animal_cosmetic` and
  `pet_cosmetic` entries.
- **Festival stock** (`festivals.toml`): Animal cosmetics appear in festival stock lists (e.g.,
  `nora_souvenir_stall`) alongside items and player cosmetics. The existing
  `collectFestivalStockSources` in `rewards.ts` already iterates these entries but only matches
  `cosmetic` and `item` keys. Add an `animal_cosmetic` branch.
- **Festival prizes** (`misc.toml`): The `small_animal_festival_rewards` and
  `large_animal_festival_rewards` arrays contain entries with both a `placeable` (wall ribbon/trophy
  item) and a `cosmetic` (ribbon cosmetic like `ribbon_blue`). The existing
  `collectAnimalFestivalRewardSources` only processes the `placeable` items. Add a branch to also
  emit `festival_activity` sources for the `cosmetic` field into the animal cosmetic accumulator,
  expanding the template `{AnimalKind}` the same way as the placeable.
- **Quests** (`quests/story_quests.toml`): The quest reward collector should handle
  `animal_cosmetic` entries from quest reward lists, emitting `quest` sources.
- **Breeding** (`ranching/animals/*.toml`): Each seasonal variant has a `default_cosmetic` field
  naming the cosmetic automatically unlocked when breeding that variant. Emit a `breed` source for
  each. This can be collected in the animals extractor itself (it already reads variants) or in a
  dedicated pass.

#### Main pipeline wiring

After all collectors run, iterate `animalCosmeticSources.entries()`, decompose each key, and attach
the sources array to `trackerData.animals[animalId].cosmetics[cosmeticId].sources`.

#### UI

`animal-cosmetics-section.svelte` line 48 currently hardcodes `sources: []`. Change to pass the
actual sources from `trackerData.animals[animalId].cosmetics[cosmeticId].sources`.

### 2. Pets

Pet cosmetics and pet skins live under a unified `pets` key in `TrackerData`:

```typescript
export interface TrackerData {
  // ...existing fields...
  pets: {
    cosmetics: Record<PetCosmeticSetId, PetCosmeticSet>;
    skins: Record<PetSkinId, PetSkin>;
  };
}

export type PetCosmeticSetId = string & { readonly __brand: "PetCosmeticSetId" };
export type PetSkinId = string & { readonly __brand: "PetSkinId" };

export interface PetCosmeticSet extends TrackerEntity {
  name: string;
}

export interface PetSkin extends TrackerEntity {
  name: string;
}
```

Both extend `TrackerEntity`, getting `sources` and `visibility` for free.

#### Pet cosmetics

##### Extractor

New `extractPetCosmetics` function reads `pets.toml`'s `cosmetic_sets` table. Each set has `ui_icon`
and `name`; the extractor emits one `PetCosmeticSet` per entry with the display name. Tracked at the
set level (not per pet kind) because unlocking a set unlocks it for both cat and dog simultaneously.

##### Sources

Pet cosmetic set unlock items flow through `ItemUse.UnlockPetCosmetic`. The TOML data for these is:

- **Chicken statue**: 11 of 12 sets appear as `pet_cosmetic` entries in `chicken_statue.toml`'s
  `common.small_roll`. These are collected by the same new chicken statue loot collector described
  in section 1, emitting `chicken_statue` sources.
- **Monster drops**: The skull mask set drops from pink saplings (`sap.toml`) as a `pet_cosmetic`
  monster drop entry. The existing monster drop collector in `natural.ts` needs a `pet_cosmetic`
  branch.

A `PetCosmeticSourceAccumulator` collects sources keyed by `PetCosmeticSetId`. The chicken statue
loot collector and monster drop collector emit into it.

Note: The 177 individual cosmetic entries (per pet kind per set) are sprite-level detail. The
tracker doesn't need per-sprite granularity; one checkbox per set is sufficient.

#### Pet skins

##### Extractor

New `extractPetSkins` function reads all items and filters for those with a `pet_skin_unlock` field.
Each produces one `PetSkin` entry keyed by the unlock value (e.g., `"sapling"`, `"mushroom"`). The
display name comes from the item's `name` field with the "Pet Skin: " prefix stripped.

##### Sources

Pet skin items are already tracked as items with monster drop sources. The extractor can read the
item's sources from the item source accumulator (which already has monster drop data) and copy them
to the pet skin entry. Alternatively, the pet skin extractor can run after source collection and
look up each `pet_skin_*` item's sources directly.

#### User state

Add `petCosmetics: Set<PetCosmeticSetId>` and `petSkins: Set<PetSkinId>` to the completed state.
Initialize as empty sets for existing saves.

#### UI

Display on the animals page as two peer sections alongside Variants and Cosmetics:

- **Pet Cosmetics**: listed under a "Pet" heading, one row per cosmetic set (e.g., "Halo", "Flower
  Crown"). Uses `ExpandableSection` + `TrackerRow`.
- **Pet Skins**: listed under a "Pet Skins" heading, one row per skin (14 rows). Uses
  `ExpandableSection` + `TrackerRow`.

### Completion state

- `isAnimalComplete` continues to check variants + cosmetics per species (unchanged).
- `areAllAnimalsComplete` expands to also require all pet cosmetic sets and all pet skins completed.
- The "all completed" confetti on the animals page fires only when everything is done: all species
  variants, all species cosmetics, all pet cosmetics, and all pet skins.

### Save file import

The existing save importer (`import-save.ts`) already handles `animal_cosmetic_unlocks`. It needs
two new sections:

- **Pet cosmetic sets**: read `pet_cosmetic_sets_unlocked` (array of set ID strings) from the player
  entry, validate against `trackerData.pets.cosmetics`, populate the completed set.
- **Pet skins**: read `pet_skin_unlocks` (array of skin ID strings) from the player entry, validate
  against `trackerData.pets.skins`, populate the completed set.

The exact save field names need to be confirmed against a real save file during implementation.

Transfer encoding changes: the new completed sets need entries in the transfer code's deterministic
ordering. This requires adding `petCosmetics` and `petSkins` to the transfer schema with appropriate
version bumps.

### Cleanup: drop `fullName` from `AnimalCosmetic`

The current `AnimalCosmetic.fullName` (e.g., "Chicken Business Tie") is trivially synthesized as
`"${speciesName} ${cosmeticName}"` at display time. Dropping it saves ~115 entries of redundant
string data from `tracker-data.json`. Any display code that uses `fullName` should synthesize it
from `animal.name` and `cosmetic.name` instead.

### Files touched

**Data contract:**

- `src/lib/types/tracker-data.ts` — `AnimalCosmetic extends TrackerEntity`, drop `fullName`, add
  `PetCosmeticSet`, `PetSkin`, new ID types, `pets` on `TrackerData`

**Pipeline:**

- `pipeline/src/extractors/animals.ts` — drop `fullName`, initialize `sources`, collect
  `default_cosmetic` breed sources
- `pipeline/src/extractors/pets.ts` — new extractor for pet cosmetics and pet skins
- `pipeline/src/acquisition/source-accumulator.ts` — `AnimalCosmeticSourceAccumulator`,
  `PetCosmeticSourceAccumulator`
- `pipeline/src/acquisition/collectors/stores.ts` — handle `animal_cosmetic` entries
- `pipeline/src/acquisition/collectors/rewards.ts` — handle animal cosmetic + pet cosmetic entries
  in chicken statue, festivals, quests; handle ribbon cosmetics from festival prizes
- `pipeline/src/acquisition/collectors/natural.ts` — handle `pet_cosmetic` monster drops
- `pipeline/src/main.ts` — wire new accumulators, call new extractors, attach sources

**App:**

- `src/lib/stores/user-state.svelte.ts` — `petCosmetics` and `petSkins` completed sets, toggle
  methods
- `src/lib/components/animals-content.svelte` — add pet cosmetics and pet skins sections, expand
  completion check
- `src/lib/components/animal-cosmetics-section.svelte` — pass real sources instead of `[]`
- `src/lib/engine/import-save.ts` — import pet cosmetic sets and pet skins from save files
- `src/lib/engine/transfer.ts` — add pet cosmetics and pet skins to transfer encoding
- New or adapted component for pet cosmetics/skins sections
- Any code referencing `AnimalCosmetic.fullName` — update to synthesize on the fly

**Tests:**

- Test files for each modified collector
- Tests for new extractors
- User state tests for new completed sets
- Transfer encoding compatibility tests
