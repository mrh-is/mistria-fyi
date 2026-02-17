# Implementation Guide — Playtest Notes

> Notes taken while playing Fields of Mistria v0.14.4. Some data issues may stem from the Fiddle
> version being older than the game build. Each issue includes root cause, file locations, and
> concrete implementation steps.
>
> **Prerequisite for many issues:** The pipeline currently skips the entire `$.ui` section
> (`parse-fiddle.ts` line 75: `SKIP_SECTIONS` includes `"ui"`). Many fixes below require removing
> `"ui"` from `SKIP_SECTIONS` and extracting data from the newly-available UI structures. This
> should be done first as a standalone pipeline change.

---

## Table of Contents

1. [Pipeline: Stop Skipping `$.ui`](#1-pipeline-stop-skipping-ui)
2. [Save File Import: `.sav` Unpacking](#2-save-file-import-sav-unpacking)
3. [Almanac: Restructure Using In-Game Categories](#3-almanac-restructure-using-in-game-categories)
4. [Animals: Flip IA Hierarchy](#4-animals-flip-ia-hierarchy)
5. [Museum: Set Ordering from Game Data](#5-museum-set-ordering-from-game-data)
6. [Museum: "Complete Set" Button Position](#6-museum-complete-set-button-position)
7. [Mines: Biome Range Display Bug](#7-mines-biome-range-display-bug)
8. [Mines: Text Input for Floor Level](#8-mines-text-input-for-floor-level)
9. [Mines: Double-Tap Zoom on Stepper](#9-mines-double-tap-zoom-on-stepper)
10. [NPC Completion: Partial Hearts](#10-npc-completion-partial-hearts)
11. [Skills: Partial Level Progress](#11-skills-partial-level-progress)
12. [Animal Colors: Tier-Based Spoilers](#12-animal-colors-tier-based-spoilers)
13. [Season Animals: Timely Filtering](#13-season-animals-timely-filtering)
14. [Animal Cosmetics: Skip `default` Key](#14-animal-cosmetics-skip-default-key)
15. [Cosmetics: No Sources Shown](#15-cosmetics-no-sources-shown)
16. [Nameless Items: Filter from Pipeline](#16-nameless-items-filter-from-pipeline)
17. [Settings: Show Game Version](#17-settings-show-game-version)
18. [Custom Icons: Platonic NPC & Blizzard](#18-custom-icons-platonic-npc--blizzard)
19. [Completed Quests Visibility](#19-completed-quests-visibility)
20. [Global "Everything" View](#20-global-everything-view)
21. [Questions for Review](#questions-for-review)

---

## 1. Pipeline: Stop Skipping `$.ui`

**Why:** Multiple fixes below depend on UI data currently being discarded. The `$.ui` tree contains
authoritative in-game ordering and categorization data.

**Key data that becomes available:**

| Path                                      | Contains                                                       |
| ----------------------------------------- | -------------------------------------------------------------- |
| `$.ui.menus.sub_menus.almanac.categories` | 10 almanac categories with tag-based filtering + display order |
| `$.ui.menus.standard_menus.museum`        | Wing order + per-wing set ordering arrays                      |
| `$.ui.character_customization`            | Cosmetic slot categories with sub-groupings                    |
| `$.ui.crafting`                           | Crafting recipe categories                                     |
| `$.ui.skill_menu`                         | Perk trees per skill domain                                    |

**Implementation:**

1. In [parse-fiddle.ts:47](pipeline/src/parse-fiddle.ts#L47), remove `"ui"` from `SKIP_SECTIONS`.

2. The `SKIP_PATTERNS` array (line 15) already filters out sprite/animation/sound keys, so most
   visual-only UI data will still be skipped. If the parsed output grows too large, add targeted
   pattern skips rather than blanket-skipping the entire section.

3. Run the pipeline and verify the `$.ui` subtree appears in `pipeline/output/fiddle-readable.json`.

---

## 2. Save File Import: `.sav` Unpacking

**Context:** The `.sav` file is a custom binary container (not a renamed JSON or a ZIP). It was
introduced in game v0.11.5 to fix Steam Cloud Save issues. Unpacking requires the official
[vaultc](https://github.com/NPC-Studio/vaultc) tool (Rust, Windows) or the community
[VaultGo](https://github.com/lordp/VaultGo) port (Go, Linux — untested by us).

**What unpacking yields:**

JSON files: `player.json`, `quests.json`, `npcs.json`, `farm.json`, `gamedata.json`,
`game_stats.json`, `header.json`, `info.json`, plus location files (`town.json`, `beach.json`, etc.)
and `checksums.json`.

Binary: `farm.bin` (farm buffer, not needed for import).

**What we can import from each file:**

- `player.json` — items acquired/sold, cosmetics, animal variants, spells (already supported)
- `quests.json` — quest completion state (currently impossible to track manually)
  - `$.completed_quests` gives quest IDs
- `npcs.json` — NPC relationship levels
  - `$.{npc}.heart_points` gives points value, cross-reference with `$.misc.npc_heart_point_table`
    in fiddle to determine level
- `farm.json` — animal ownership / variants on the farm
- `game_stats.json` — various completion stats
  - `$.renown_level_ups` could be source for current town level (if it's not listed elsewhere)
- `gamedata.json` — building status, museum progress
  - `$.building_modifier_status`, `$.museum_progress`

**Architecture options for browser-based unpacking:**

| Option                   | Approach                                                  | Pros                                       | Cons                                                         |
| ------------------------ | --------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------ |
| **A: WASM**              | Compile vaultc (Rust) to WASM via `wasm-pack`             | Fully client-side, no upload, best privacy | Source code not available, only binary release + MIT license |
| **B: Cloudflare Worker** | Upload `.sav`, Worker runs unpacker, returns JSON         | Server handles binary format               | Requires file upload (privacy), server cost                  |
| **C: JS port**           | Reverse-engineer format from vaultc binary, rewrite in TS | Pure JS, no WASM, best bundle size         | Most effort, breaks if format changes                        |

**Note:** Neither vaultc nor VaultGo publish source code. The vaultc download includes an MIT
license file, so the format itself is not proprietary, but we can't compile from source.
Reverse-engineering the binary format from the tool's behavior (or contacting the devs) would be
needed for Options A or C. Option B could work by running the pre-built vaultc binary server-side.

**Immediate UI improvement** (before implementing unpacking):

In [import-card.svelte](src/routes/settings/import-card.svelte):

- Explain that saves are `.sav` files requiring extraction
- Link to [vaultc releases](https://github.com/NPC-Studio/vaultc) for the extraction tool
- Note that extracted `player.json` is what should be uploaded
- Update the file input `accept` attribute to also allow `.json` (keep current behavior)

---

## 3. Almanac: Restructure Using In-Game Categories

**Issue:** The app's Almanac categories, ordering, and item membership don't match the in-game
Almanac. The current pipeline builds categories from the Fiddle item tree structure
(`items/{furniture,fish,mines,other}`), but the in-game Almanac uses a tag-based system defined at
`$.ui.menus.sub_menus.almanac.categories`.

**In-game Almanac categories** (in display order):

| #   | Key             | Tag filter      | Display name                         |
| --- | --------------- | --------------- | ------------------------------------ |
| 0   | `artifacts`     | `archaeology`   | Artifacts                            |
| 1   | `blacksmithing` | `blacksmithing` | Blacksmithing                        |
| 2   | `bugs`          | `bugs`          | Bugs                                 |
| 3   | `cooked_dishes` | `food`          | Cooked Dishes                        |
| 4   | `crops`         | `crop`          | Crops                                |
| 5   | `fish`          | `fishable`      | Fishing and Diving (via `local_key`) |
| 6   | `forageables`   | `forageable`    | Forageables                          |
| 7   | `furniture`     | `furniture`     | Furniture                            |
| 8   | `materials`     | `material`      | Materials                            |
| 9   | `ranching`      | `ranching`      | Ranching                             |

**This replaces multiple previous concerns:** Almanac ordering, fish rename, cooked dishes extras,
missing crops, missing materials, milling placement. The tag-based approach from game data will
naturally resolve all of these — items appear in the almanac section matching their tags.

**Implementation:**

1. **Requires:** Issue #1 (stop skipping `$.ui`).

2. Rewrite [almanac.ts](pipeline/src/extractors/almanac.ts) extractor:
   - Read `$.ui.menus.sub_menus.almanac.categories` for the category definitions
   - For each item across all of `$.items`, check its `tags` array
   - Place each item into the almanac category whose tag it matches
   - Preserve the array index ordering (0–9) so categories render in game order
   - Items matching no almanac tag are excluded from the Almanac (they're not in-game trackable)

3. Handle the `fish` category's `local_key: "misc_local/fishing_and_diving"` — use this as the
   display name rather than deriving from the key.

4. Update [format.ts](src/lib/utils/format.ts) `parseAlmanacCategory()` — the category key structure
   will change from `"furniture/tide_set"` to flat keys like `"furniture"`. The group nesting may no
   longer be needed, or it can be derived from the new structure.

5. In [almanac/+page.svelte](<src/routes/(category)/almanac/+page.svelte>), replace the alphabetical
   group sort (line 108) with order-preserving rendering based on the category array index.

6. **Furniture base-piece counting:** The in-game Almanac counts base furniture pieces (not
   colorways). Colorway variants are linked via `$.items.furniture.{set}.{item}.recipe_key` — items
   sharing the same `recipe_key` are colorways of the same base piece (e.g., `basic_area_rug_green`
   and `basic_area_rug_yellow` both have `recipe_key: "basic_area_rug"`). The data between colorways
   is identical except for ID/name/object/icon, so any one can represent the group. To collapse:
   group items by `recipe_key`, keep only the first item encountered per group, and skip the rest.
   Use the `recipe_key` value as the display name (title-cased) so the entry reads "Basic Area Rug"
   rather than "Basic Area Rug Green".

**State migration:** The serialized `completed.almanac` set contains ItemId strings. If item IDs
stay the same (just re-categorized), no migration is needed — the IDs are stable. Only the category
grouping changes. Since there are no current users, breaking changes are fine.

---

## 4. Animals: Flip IA Hierarchy

**Issue:** The current hierarchy is `Animal → Color Variants / Cosmetics`. The desired hierarchy
flips the two levels: the top level should be "Color Variants" and "Cosmetics" as two sections, with
each listing all animal species underneath.

**Current structure:**

```
Cow
  └ Color Variants (Brown, Gold, Pink...)
  └ Cosmetics (Beret, Crown...)
Chicken
  └ Color Variants (...)
  └ Cosmetics (...)
```

**Target structure:**

```
Color Variants
  └ Cow (Brown, Gold, Pink...)
  └ Chicken (White, Black...)
  └ ...
Cosmetics
  └ Cow (Beret, Crown...)
  └ Chicken (Ribbon, Hat...)
  └ ...
```

**Where:** [animals/+page.svelte](<src/routes/(category)/animals/+page.svelte>)

**Implementation:**

1. Replace the current `{#each animals ...}` loop with two top-level `ExpandableSection`s:

   ```svelte
   <ExpandableSection name="Color Variants" count={totalVariantsCompleted} total={totalVariants}>
     {#each animals as animal}
       <ExpandableSection name={animal.name} ...>
         {#each sortedVariants(animal.variants) as [vid, variant]}
           <!-- variant checkbox rows (same as current) -->
         {/each}
       </ExpandableSection>
     {/each}
   </ExpandableSection>

   <ExpandableSection name="Cosmetics" count={totalCosmeticsCompleted} total={totalCosmetics}>
     {#each animals as animal}
       <ExpandableSection name={animal.name} ...>
         {#each cosmeticEntries as [cid, cosmetic]}
           <!-- cosmetic checkbox rows (same as current) -->
         {/each}
       </ExpandableSection>
     {/each}
   </ExpandableSection>
   ```

2. Compute `totalVariantsCompleted` / `totalVariants` and `totalCosmeticsCompleted` /
   `totalCosmetics` by summing across all animals.

3. No data model changes needed — same state, different rendering.

---

## 5. Museum: Set Ordering from Game Data

**Issue:** Museum sets render in JS object iteration order. In-game, each wing has a defined set
order in `$.ui.menus.standard_menus.museum.{wing}_order`.

**Game data for set ordering:**

- `archaeology_order`: 19 sets (`common_finds`, `prehistoric`, `ancient`, `alda`, `caldosian`,
  `aldarian`, `oopart`, `aquatic`, `sunken`, `deep_woods`, `mine`, `upper_mines_artifacts`,
  `tide_caverns`, `deep_earth`, `lava_caves`, `ritual`, `vintage_farm_tools`, `metals_of_mistria`,
  `gems_of_mistria`)
- `fish_order`: 19 sets (seasonal x location + `legendary`)
- `flora_order`: 17 sets (seasonal x type + mine locations)
- `insect_order`: 14 sets (seasonal + environments + `legendary`)

Wing display order: `archaeology -> fish -> flora -> insect`

**Implementation:**

1. **Requires:** Issue #1.

2. In [museum.ts](pipeline/src/extractors/museum.ts), read `$.ui.menus.standard_menus.museum` and
   use:
   - `wings` array for wing ordering (emit as an ordered array, not a Record)
   - `{wing}_order` arrays for set ordering within each wing

3. Change `TrackerData["museum"]` from `Record<WingId, ...>` to an ordered array:

   ```ts
   museum: Array<{
     id: WingId;
     name: string;
     sets: Array<{ id: SetId; items: ItemId[]; name: string }>;
   }>;
   ```

   This preserves ordering in JSON serialization.

4. In [museum/+page.svelte](<src/routes/(category)/museum/+page.svelte>), iterate the array directly
   instead of `Object.entries(...)`.

5. Update [progress.ts](src/lib/engine/progress.ts) `getMuseumProgress` to iterate the new array
   structure.

---

## 6. Museum: "Complete Set" Button Position

**Issue:** The "Complete set" / "Undo set" button is at the bottom of each set. Move it to the top
for quicker access.

**Where:** [museum/+page.svelte](<src/routes/(category)/museum/+page.svelte#L128-L167>)

**Implementation:**

Move the `<div class="mt-1 flex justify-end px-2">` block (lines 128–167) to before the
`{#each set.items.filter(shouldShowItem) ...}` loop (line 102). Change `mt-1` to `mb-1`.

---

## 7. Mines: Biome Range Display Bug

**Issue:** Every biome shows `floors X–99` because the label hardcodes `trackerData.mines.maxFloors`
as the end floor for all biomes.

**Where:** [mines/+page.svelte:85](<src/routes/(category)/mines/+page.svelte#L85>)

**Current code:**

```svelte
{currentBiome().name} (floors {currentBiome().startFloor}–{trackerData.mines.maxFloors})
```

**Implementation:**

1. In [mines.ts](pipeline/src/extractors/mines.ts), add `endFloor` to each biome:

   ```ts
   const biomes = rawBiomes.map((b, i) => ({
     id: `biome_${i}` as BiomeId,
     name: ...,
     startFloor: ...,
     endFloor: i + 1 < rawBiomes.length
       ? (rawBiomes[i + 1].floor as number ?? (i + 1) * 20 + 1) - 1
       : maxFloors,
   }));
   ```

2. Update the `TrackerData["mines"]["biomes"]` type in
   [tracker-data.ts](src/lib/types/tracker-data.ts) to include `endFloor: number`.

3. In `mines/+page.svelte`, change the label to:

   ```svelte
   {currentBiome().name} (floors {currentBiome().startFloor}–{currentBiome().endFloor})
   ```

4. Verify the off-by-1 issue: if Lava Caves should show "through 80" not "through 79", adjust the
   `endFloor` calculation (may need `nextBiome.startFloor` instead of `- 1`, depending on whether
   floors are inclusive at both ends).

**Note:** The max floor of 99 in the Fiddle is correct — an upcoming game update raises the cap.
Leave `maxFloors` as-is.

---

## 8. Mines: Text Input for Floor Level

**Issue:** Can't type a mine floor level directly — only +/- buttons. Opening any input field
doesn't grab focus, and focus can trigger zoom on mobile.

**Where:** [mines/+page.svelte](<src/routes/(category)/mines/+page.svelte#L79-L82>)

**Implementation:**

1. Replace the display `<span>Floor {floor}</span>` with a tappable number input:

   ```svelte
   <input
     type="number"
     inputmode="numeric"
     min="0"
     max={trackerData.mines.maxFloors}
     value={userState.state.completed.mines.floor}
     onchange={(e) => {
       const v = Math.max(0, Math.min(trackerData.mines.maxFloors, Number(e.currentTarget.value)));
       userState.setMineFloor(v);
     }}
     class="w-16 bg-transparent text-center text-xl font-semibold"
   />
   ```

2. To prevent iOS zoom on focus, ensure the input has `font-size: 16px` or larger (Tailwind
   `text-xl` is 20px, which is fine).

3. Keep the +/- stepper buttons alongside the input for quick adjustments.

---

## 9. Mines: Double-Tap Zoom on Stepper

**Issue:** Tapping too fast on the mines +/- buttons triggers browser double-tap zoom.

**Where:** [stepper.svelte](src/lib/components/stepper.svelte)

**Implementation:**

Add `touch-action: manipulation` to the stepper buttons. This disables the double-tap-to-zoom
gesture while keeping normal touch handling.

In Tailwind: add the `touch-manipulation` class to the increment/decrement button elements.

Alternatively, apply this globally to all interactive elements in [app.css](src/app.css):

```css
button,
input,
[role="button"] {
  touch-action: manipulation;
}
```

---

## 10. NPC Completion: Partial Hearts

**Issue:** NPC progress only counts NPCs at max level (8). Want fractional progress reflecting
partial hearts across all NPCs.

**Where:** [progress.ts](src/lib/engine/progress.ts#L87-L94) (`getNpcsProgress`)

**Current behavior:** Binary — NPC is 0% or 100%.

**Max level:** 8 for everyone (eventually 10). There is no separate cap for dateable NPCs. The
`dateable` field is for UI display only (e.g., heart vs platonic icon).

**Implementation:**

```ts
export function getNpcsProgress(ctx: ProgressContext): CategoryProgress {
  const maxLevel = MAX_NPC_LEVEL; // 8
  let total = 0;
  let completed = 0;
  for (const id of Object.keys(trackerData.npcs)) {
    total += maxLevel;
    completed += Math.min(ctx.completed.npcLevels[id] ?? 0, maxLevel);
  }
  return { completed, filtered: total - completed, total };
}
```

This yields progress like `45/120` (sum of all hearts earned vs sum of all possible hearts). The
progress bar becomes meaningfully granular.

---

## 11. Skills: Partial Level Progress

**Issue:** Same as NPCs — skills only count as done at level 60. Want fractional progress.

**Where:** [progress.ts](src/lib/engine/progress.ts#L116-L123) (`getSkillsProgress`)

**Implementation:**

```ts
export function getSkillsProgress(ctx: ProgressContext): CategoryProgress {
  const MAX_SKILL_LEVEL = 60;
  let total = 0;
  let completed = 0;
  for (const id of Object.keys(trackerData.skills)) {
    total += MAX_SKILL_LEVEL;
    completed += Math.min(ctx.completed.skillLevels[id] ?? 0, MAX_SKILL_LEVEL);
  }
  return { completed, filtered: total - completed, total };
}
```

---

## 12. Animal Colors: Tier-Based Spoilers

**Issue:** Higher-tier animal variants are spoilers. Unlocking at least one color in tier N should
reveal all colors in tier N+1. Colors in unreached tiers should be hidden behind a spoiler.

**Context:** Variants already have `tier?: number` in the data. Tier 1 = starter/default.

**Implementation:**

1. Determine the player's "unlocked tier" per animal: scan completed variants to find the highest
   tier with at least one completion. The next tier (highestCompleted + 1) is also visible (since
   getting one in tier N unlocks tier N+1). All higher tiers are spoilered.

2. In [animals/+page.svelte](<src/routes/(category)/animals/+page.svelte>), compute per-animal:

   ```ts
   function maxVisibleTier(animalId: AnimalId): number {
     const animal = trackerData.animals[animalId];
     const completedVariants = userState.state.completed.animals[animalId];
     let highestCompletedTier = 0;
     for (const [vid, variant] of Object.entries(animal.variants)) {
       if (completedVariants?.has(vid as VariantId) && (variant.tier ?? 1) > highestCompletedTier) {
         highestCompletedTier = variant.tier ?? 1;
       }
     }
     return highestCompletedTier + 1; // seeing one in tier N reveals tier N+1
   }
   ```

3. Variants above `maxVisibleTier` should be **shown but obfuscated** (not hidden entirely). Display
   them with blurred/redacted text (e.g., `filter: blur(4px)` or replace name with "???" + tier
   badge) so players can see how many remain without being spoiled on names. Tapping an obfuscated
   variant could reveal it, or a "Show all" toggle reveals the section.

4. Variants already completed should always be visible in full regardless of tier.

5. Consider a global "show all spoilers" toggle in Settings for players who don't care.

---

## 13. Season Animals: Timely Filtering

**Issue:** Animals born in a specific season should be highlighted/filtered when that season is
active, using the same "timely" availability mode as seasonal items.

**Context:** `trackerData.animals[id].variants[vid].bornIn?: Season` already exists.

**Where:**

- [animals/+page.svelte](<src/routes/(category)/animals/+page.svelte>) (`isVariantVisible`)
- [progress.ts](src/lib/engine/progress.ts) (`getAnimalsProgress`)

**Implementation:**

1. In `isVariantVisible`, add availability filtering. The behavior per mode:
   - **"timely"**: only show seasonal variants matching current season (non-seasonal hidden)
   - **"available"**: show non-seasonal variants + seasonal variants matching current season
   - **"everything"**: show all variants

   ```ts
   function isVariantVisible(animalId: AnimalId, variantId: VariantId): boolean {
     const variant = trackerData.animals[animalId].variants[variantId];
     const completed = /* existing check */;
     if (completed && !userState.state.showCompleted) return false;
     if (completed) return true;
     if (userState.state.availabilityMode === "timely") {
       // Timely = only seasonal variants for the current season
       return !!variant.bornIn && variant.bornIn === userState.state.worldState.season;
     }
     if (userState.state.availabilityMode === "available") {
       // Available = non-seasonal + current season
       if (variant.bornIn) return variant.bornIn === userState.state.worldState.season;
       return true;
     }
     return true; // "everything"
   }
   ```

2. Update `getAnimalsProgress` to reflect filtered counts in timely/available modes:
   ```ts
   // When filtering, only count variants matching the current season
   if (
     ctx.availabilityMode !== "everything" &&
     variant.bornIn &&
     variant.bornIn !== ctx.worldState.season
   ) {
     // Skip this variant from filtered count
   }
   ```

---

## 14. Animal Cosmetics: Skip `default` Key

**Issue:** The `default` key under each animal's cosmetics is not an actual cosmetic — it's a
game-internal template for applying default sprites (male/female base). It should be filtered out.

**Where:** [animals.ts](pipeline/src/extractors/animals.ts#L54-L60)

**Current code** already skips `default` for variants (line 37), but does NOT skip it for cosmetics.

**Implementation:**

In the cosmetics extraction loop (line 56), add the same skip:

```ts
if (rawCosmetics) {
  for (const [cid, c] of Object.entries(rawCosmetics)) {
    if (cid === "default") continue; // ← add this line
    cosmetics[cid as CosmeticId] = {
      name: (c.name as string | undefined) ?? cid,
    };
  }
}
```

---

## 15. Cosmetics: No Sources Shown

**Issue:** Human and animal cosmetic items show no source information (where to obtain them).

**Where:**

- [cosmetics/+page.svelte](<src/routes/(category)/cosmetics/+page.svelte>)
- [sources.ts](pipeline/src/extractors/sources.ts)
- Also relevant: `$.ui.character_customization` — cosmetic slot categories with sub-groupings

**Implementation:**

1. In the pipeline's `sources.ts`, check whether cosmetic items have source entries in Fiddle (e.g.,
   store availability, quest rewards). If sources exist but aren't being extracted for cosmetics,
   add them.

2. `$.ui.character_customization` provides organized cosmetic categories:
   - `head_gear`: hat, hair_accessory, helmet, crown, misc
   - `face_gear`: glasses, ear_accessory, face_accessory
   - `hair`: short, medium, long
   - `top`: sleeveless, short_sleeve, long_sleeve, dress, robe, suit, misc
   - `bottom`: pants, shorts, skirt, misc
   - `feet`: boots, shoes, sandals, misc
   - `back`, `eyes`, `facial_hair`, `skin`

   This data can be used to better organize the cosmetics page into sub-sections matching the
   in-game customization UI. Currently cosmetics have a `slot` field — this UI data provides
   finer-grained sub-categories within each slot.

3. In the cosmetics page component, add source display per cosmetic (reuse the source badge pattern
   from `ItemRow`).

---

## 16. Nameless Items: Filter from Pipeline

**Issue:** Some items in `$.items` lack a `name` field and aren't real collectible items. Example:
`perfect_gift` has no name, only a description and icon sprite.

**Full list of nameless items** (7 out of 1903 total):

| Item                               | Purpose                                        |
| ---------------------------------- | ---------------------------------------------- |
| `other/misc/perfect_gift`          | Internal item template, not a real collectible |
| `other/misc/animal_cosmetic`       | Generic animal cosmetic container              |
| `other/misc/cosmetic`              | Generic cosmetic container                     |
| `other/misc/horse_potion`          | May be unreleased/internal                     |
| `other/misc/lurid_colored_drink`   | May be unreleased/internal                     |
| `other/misc/pet_cosmetic`          | Generic pet cosmetic container                 |
| `other/misc/stinky_stamina_potion` | May be unreleased/internal                     |

**Implementation:**

In [almanac.ts](pipeline/src/extractors/almanac.ts#L55-L65), add a name check:

```ts
for (const [itemId, item] of Object.entries(categoryItems)) {
  if (itemId === "default") continue;
  if (typeof item !== "object" || item === null) continue;
  if (chestIds.has(itemId)) continue;

  const itemData = item;
  const rawName = itemData.name as string | undefined;
  if (!rawName) continue; // ← skip items without a name field

  const name = rawName ?? snakeToTitle(itemId);
  // ...
}
```

This is clean and will correctly filter all 7 nameless items. Since none of them are real
collectibles, this is the right approach.

---

## 17. Settings: Show Game Version

**Issue:** The settings page shows the Fiddle game version but doesn't clarify what it is. Also add
the Harvest Helper app version so users can cross-reference.

**Where:** [settings/+page.svelte](src/routes/settings/+page.svelte#L74-L76)

**Current:** `Game data: Fields of Mistria v{trackerData.version}`

**Implementation:**

At the bottom of the settings page, expand the version display:

```svelte
<div class="text-center text-sm text-muted-foreground">
  <p>Game data: Fields of Mistria v{trackerData.version}</p>
  <p>Harvest Helper v{APP_VERSION}</p>
</div>
```

Define `APP_VERSION` from `package.json` version (use Vite's `define` or `import.meta.env`), or
hardcode for now.

---

## 18. Custom Icons: Platonic NPC & Blizzard

**Status: BLOCKED — requires custom SVG artwork.**

The current Lucide icons are the best available from the library. Two cases need custom SVGs:

1. **Platonic NPC icon** — to distinguish non-dateable NPCs from dateable ones (currently both use
   Heart)
2. **Blizzard weather icon** — winter's `heavy_inclement` needs a distinct icon from regular storm

**No code changes until custom SVGs are created.** When ready, add them to a local SVG icon
component set and reference them in the NPC list and weather selector respectively.

---

## 19. Completed Quests Visibility

**Issue:** There is no way in-game to see completed quests, making manual tracking unreliable (you'd
have to mark each quest as you complete it and never miss one).

**Resolution:** This is effectively solved by the `.sav` import (Issue #2). The `quests.json` file
extracted from the `.sav` contains quest completion state, which can be imported into the app's
`completed.questStates`.

**Interim improvement:** Add a note on the Quests page explaining that quest tracking is most
accurate when imported from a save file, and link to the import settings.

---

## 20. Global "Everything" View

**Status: Larger project — needs UX discussion first.**

Player wants a single flat list of everything remaining, especially useful for timely items and
late-game gap analysis. This requires UX design work before implementation:

- What should the default grouping be? (by category, by availability, by source type)
- How should it interact with the existing availability modes?
- Should it be a new page, a search enhancement, or a home page feature?
- Performance implications of rendering all items in one list

**Park this for a dedicated UX discussion.**

---

## Questions for Review

No open questions — all clarifications have been incorporated above.
