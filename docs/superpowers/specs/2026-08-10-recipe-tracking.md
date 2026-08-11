# Recipe tracking & acquisition display

## Context

Mistria v1.0.2 has a rich recipe system: furniture and dishes have recipes with ingredients,
crafting times, star levels, and kitchen tier requirements. Recipes are acquired through quests
(Stillwell challenges, Tali challenges, story quests), stores, letters, cutscenes, festivals, renown
rewards, and default unlocks. Multiple items can share a single recipe via `recipe_key` (furniture
colorways).

The pipeline currently classifies items into almanac categories and tracks where to obtain finished
items (sources), but has no concept of recipe acquisition as distinct from item ownership. The old
Python pipeline had recipe tracking in its Supabase upload code, but that was never ported to the TS
pipeline.

## What to build

### Recipe registry

A new `recipes` section in `TrackerData` that groups items by their recipe identity:

- **Recipe ID**: `item.recipe_key ?? itemId` — colorways of the same furniture piece share one
  recipe
- **Recipe members**: all item IDs sharing that recipe ID
- **Presentations**: sub-groups by display name within a recipe (handles cases like `mermaid_bed`
  where single and double beds share a `recipe_key` but have different names)
- **Default unlocked**: whether the recipe is available from the start (`recipe_is_default`)
- **Acquisition sources**: how the recipe is obtained (quest reward, store purchase, letter, etc.)

### Acquisition source types

Recipes can be acquired through several channels. Known channels from the v1.0.2 data:

1. **Quest rewards** — `recipe_scroll` and `crafting_scroll` rewards in quest data. ~61 known
   instances across Stillwell challenges, Tali challenges, and other quest types.
2. **Default unlock** — `recipe_is_default = true` on the item
3. **Store purchase** — recipe scrolls appearing in store stock (these exist but are explicitly
   items, not tracked as recipe sources in v1)
4. **Letters** — some recipes arrive via mail (needs investigation)
5. **Cutscenes** — some recipes unlock during story events (needs investigation)
6. **Festivals** — festival vendor recipe scrolls (needs investigation)
7. **Renown** — renown reward recipe scrolls (needs investigation)

Initial implementation should cover quest rewards and default unlocks. The recipe model should be
extensible to other source types without restructuring.

### Almanac integration

Collapsed furniture colorway rows should display:

- Color count ("5 colors")
- Recipe acquisition source ("Unlocked by completing the Stillwell challenge 'Green Sapling
  Surprise'")
- "Default recipe" for default-unlocked recipes

Recipe completion is NOT a separate tracking concern — almanac completion remains "own one of each
displayed item." Recipe info is display-only context.

### Key example

The Sapling Beanbag Chair has five colorways sharing `recipe_key = "sapling_beanbag_chair"`. The
`green_sapling_surprise` Stillwell challenge rewards a `crafting_scroll` targeting
`sapling_beanbag_chair_green`. That reward unlocks the recipe for all five colors. The almanac
should show one collapsed row with "5 colors" and the quest source.

## Scope boundaries

- Recipe data extraction and `TrackerData` types: in scope
- UI components for recipe display: in scope
- Recipe completion tracking in user state: out of scope (recipes are display-only)
- Non-quest acquisition channels beyond default unlock: deferred (model supports them,
  implementation investigates later)
- Dish-specific recipe fields (star level, kitchen tier, cooking time, restore value): deferred

## Dependencies

- Requires the pipeline v2 TOML migration (pipeline-v2-toml branch) to be complete
- Uses the requirements resolver from that migration for quest reward parsing
