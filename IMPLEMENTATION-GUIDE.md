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

1. ~~[Pipeline: Stop Skipping `$.ui`](#1-pipeline-stop-skipping-ui--done)~~ ✅
2. [Save File Import: `.sav` Unpacking](#2-save-file-import-sav-unpacking)
3. ~~[Almanac: Restructure Using In-Game Categories](#3-almanac-restructure-using-in-game-categories--done)~~
   ✅
4. ~~[Animals: Flip IA Hierarchy](#4-animals-flip-ia-hierarchy--done)~~ ✅
5. ~~[Museum: Set Ordering from Game Data](#5-museum-set-ordering-from-game-data--done)~~ ✅
6. ~~[Museum: "Complete Set" Button Position](#6-museum-complete-set-button-position--done)~~ ✅
7. ~~[Mines: Biome Range Display Bug](#7-mines-biome-range-display-bug--done)~~ ✅
8. ~~[Mines: Text Input for Floor Level](#8-mines-text-input-for-floor-level--done)~~ ✅
9. ~~[Mines: Double-Tap Zoom on Stepper](#9-mines-double-tap-zoom-on-stepper--done)~~ ✅
10. ~~[NPC Completion: Partial Hearts](#10-npc-completion-partial-hearts--done)~~ ✅
11. ~~[Skills: Partial Level Progress](#11-skills-partial-level-progress--done)~~ ✅
12. ~~[Animal Colors: Tier-Based Spoilers](#12-animal-colors-tier-based-spoilers--done)~~ ✅
13. ~~[Season Animals: Timely Filtering](#13-season-animals-timely-filtering--done)~~ ✅
14. ~~[Animal Cosmetics: Skip `default` Key](#14-animal-cosmetics-skip-default-key--done)~~ ✅
15. ~~[Cosmetics: No Sources Shown](#15-cosmetics-no-sources-shown--done)~~ ✅
16. ~~[Nameless Items: Filter from Pipeline](#16-nameless-items-filter-from-pipeline--done)~~ ✅
17. ~~[Settings: Show Game Version](#17-settings-show-game-version--done)~~ ✅
18. [Custom Icons: Platonic NPC & Blizzard](#18-custom-icons-platonic-npc--blizzard)
19. ~~[Completed Quests Visibility](#19-completed-quests-visibility--done)~~ ✅
20. [Global "Everything" View](#20-global-everything-view)
21. [Animal Cosmetics: Drop Species Name in Pipeline](#21-animal-cosmetics-drop-species-name-in-pipeline)
22. [Spoiler UI: Revisit Design](#22-spoiler-ui-revisit-design)
23. [NPC Hearts: Center Content](#23-npc-hearts-center-content)
24. [Reset Buttons: Mobile Overflow](#24-reset-buttons-mobile-overflow)
25. [Toolbar: Extra Bottom Padding](#25-toolbar-extra-bottom-padding)
26. [Stepper Component: Center Content](#26-stepper-component-center-content)
27. [Item Row: Source Tap Affordance](#27-item-row-source-tap-affordance)
28. [Questions for Review](#questions-for-review)

---

## 1. ~~Pipeline: Stop Skipping `$.ui`~~ ✅ Done

Removed `"ui"` from `SKIP_SECTIONS` in `parse-fiddle.ts`. The `SKIP_PATTERNS` array still filters
out visual-only keys. Pipeline output confirmed all expected UI data paths are available
(`almanac.categories`, `museum` orders, `character_customization`, `crafting`, `skill_menu`).

**Key data that became available:**

| Path                                      | Contains                                                       |
| ----------------------------------------- | -------------------------------------------------------------- |
| `$.ui.menus.sub_menus.almanac.categories` | 10 almanac categories with tag-based filtering + display order |
| `$.ui.menus.standard_menus.museum`        | Wing order + per-wing set ordering arrays                      |
| `$.ui.character_customization`            | Cosmetic slot categories with sub-groupings                    |
| `$.ui.crafting`                           | Crafting recipe categories                                     |
| `$.ui.skill_menu`                         | Perk trees per skill domain                                    |

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

## 3. ~~Almanac: Restructure Using In-Game Categories~~ ✅ Done

Rewrote the almanac extractor to use the in-game UI tag-based category system from
`$.ui.menus.sub_menus.almanac.categories`. Items are now assigned to categories by matching their
`tags` array against each category's tag filter. The v0.14.4 data has 11 categories (the original 10
plus `date_inspiration`).

**Changes made:**

- **[almanac.ts](pipeline/src/extractors/almanac.ts)** — Complete rewrite. Reads UI category
  definitions, assigns items by tag matching, collapses furniture colorways by `recipe_key` (1101 →
  641 items), skips nameless items (issue #16), outputs as ordered `AlmanacCategory[]` array.
- **[tracker-data.ts](src/lib/types/tracker-data.ts)** — Added `AlmanacCategory` interface; changed
  `almanac` from `Record<string, ...>` to `AlmanacCategory[]`.
- **[almanac/+page.svelte](<src/routes/(category)/almanac/+page.svelte>)** — Simplified to flat
  iteration over the ordered category array. Removed `parseAlmanacCategory` dependency.
- **[format.ts](src/lib/utils/format.ts)** — Removed unused `parseAlmanacCategory`.
- **[progress.ts](src/lib/engine/progress.ts)** — Updated `getAlmanacProgress` for array iteration.
- **[transfer.ts](src/lib/engine/transfer.ts)** — Updated `getAlmanacOrder` for array iteration.

**Output:** 11 categories, 1389 items — Artifacts (90), Blacksmithing (56), Bugs (78), Cooked Dishes
(167), Crops (37), Date Inspiration (6), Fishing and Diving (126), Forageables (88), Furniture
(641), Materials (61), Ranching (39).

---

## 4. ~~Animals: Flip IA Hierarchy~~ ✅ Done

Flipped the animals page hierarchy from `Animal → (Variants, Cosmetics)` to
`(Color Variants, Cosmetics) → Animal`. The top level now shows two `ExpandableSection`s — "Color
Variants" and "Cosmetics" — each containing per-animal sub-sections with the same checkbox rows.

**Changes made:**

- **[animals/+page.svelte](<src/routes/(category)/animals/+page.svelte>)** — Replaced the single
  `{#each animals}` loop with two top-level `ExpandableSection`s. Added `$derived` totals
  (`totalVariants`, `totalVariantsCompleted`, `totalCosmetics`, `totalCosmeticsCompleted`) summed
  across all animals. No data model changes — same state, different rendering.

---

## 5. ~~Museum: Set Ordering from Game Data~~ ✅ Done

Rewrote the museum extractor to read wing and set ordering from `$.ui.menus.standard_menus.museum`.
Output changed from `Record<WingId, ...>` to `MuseumWing[]`.

**Changes made:**

- **[museum.ts](pipeline/src/extractors/museum.ts)** — Reads `museum.wings` for wing order and
  `museum.{wing}_order` for per-wing set order. Outputs ordered `MuseumWing[]` array.
- **[tracker-data.ts](src/lib/types/tracker-data.ts)** — Added `MuseumWing` interface; changed
  `museum` from `Record<WingId, ...>` to `MuseumWing[]`.
- **[museum/+page.svelte](<src/routes/(category)/museum/+page.svelte>)** — Iterates arrays directly.
- **[progress.ts](src/lib/engine/progress.ts)** — Updated `getMuseumProgress` for array iteration.
- **[transfer.ts](src/lib/engine/transfer.ts)** — Updated `getMuseumOrder` for array iteration.
- **[import-save.ts](src/lib/engine/import-save.ts)** — Updated museum iteration.

**Output:** 4 wings (Archaeology → Fish → Flora → Insects), 70 sets, 349 items — all matching
in-game order.

---

## 6. ~~Museum: "Complete Set" Button Position~~ ✅ Done

Removed the "Complete set" / "Undo set" button entirely. Since museum completion can be imported
from save files (issue #2), manual bulk-completion is no longer needed.

**Where:** [museum/+page.svelte](<src/routes/(category)/museum/+page.svelte>) — removed the button
block and its unused imports (`CheckCheck`, `Undo2`, `Button`).

---

## 7. ~~Mines: Biome Range Display Bug~~ ✅ Done

Added `endFloor` to each biome, computed from the next biome's `startFloor - 1` (or `maxFloors` for
the last biome). Each biome now shows its correct floor range instead of always ending at 99.

**Changes made:**

- **[mines.ts](pipeline/src/extractors/mines.ts)** — Added `endFloor` to biome extraction.
- **[tracker-data.ts](src/lib/types/tracker-data.ts)** — Added `endFloor: number` to biome type.
- **[mines/+page.svelte](<src/routes/(category)/mines/+page.svelte>)** — Changed label to use
  `currentBiome().endFloor`.

**Output:** Upper Mines 1–19, Tide Caverns 20–39, Deep Earth 40–59, Lava Caves 60–79, Ancient Ruins
80–99.

---

## 8. ~~Mines: Text Input for Floor Level~~ ✅ Done

Replaced the static "Floor N" span with an editable number input, centered between the +/- stepper
buttons. Uses `inputmode="numeric"` for mobile keyboards, `text-xl` (20px) to prevent iOS auto-zoom,
and hidden native spin buttons to avoid conflicts with the stepper.

**Where:** [mines/+page.svelte](<src/routes/(category)/mines/+page.svelte>)

---

## 9. ~~Mines: Double-Tap Zoom on Stepper~~ ✅ Done

Added `touch-manipulation` Tailwind class to both stepper buttons, disabling double-tap-to-zoom
while preserving normal touch handling.

**Where:** [stepper.svelte](src/lib/components/stepper.svelte)

---

## 10. ~~NPC Completion: Partial Hearts~~ ✅ Done

Changed `getNpcsProgress` from binary (0% or 100% per NPC) to granular (sum of all heart levels vs
sum of all possible hearts). Progress now shows e.g. `45/120` instead of `3/15`.

**Changes made:**

- **[progress.ts](src/lib/engine/progress.ts)** — `getNpcsProgress` now sums
  `Math.min(level, MAX_NPC_LEVEL)` across all NPCs, with `total = npcCount × MAX_NPC_LEVEL`.

---

## 11. ~~Skills: Partial Level Progress~~ ✅ Done

Changed `getSkillsProgress` from binary (0% or 100% per skill at level 60) to granular (sum of all
skill levels vs sum of all possible levels). Extracted `MAX_SKILL_LEVEL = 60` as a named constant.

**Changes made:**

- **[progress.ts](src/lib/engine/progress.ts)** — Added `MAX_SKILL_LEVEL = 60` constant.
  `getSkillsProgress` now sums `Math.min(level, MAX_SKILL_LEVEL)` across all skills.
- **[skills/+page.svelte](<src/routes/(category)/skills/+page.svelte>)** — Replaced hardcoded `60`
  with `MAX_SKILL_LEVEL` import.

---

## 12. ~~Animal Colors: Tier-Based Spoilers~~ ✅ Done

Implemented tier-based spoiler system for animal color variants. Variants above the player's
unlocked tier are shown with blurred text and disabled checkboxes. Completing any variant in tier N
reveals all variants in tier N+1.

**Changes made:**

- **[animals/+page.svelte](<src/routes/(category)/animals/+page.svelte>)** — Added `maxVisibleTier`
  (scans completed variants for highest tier, returns +1) and `isVariantSpoilered` (checks tier
  against max visible). Spoilered variants render with `blur-sm`, `select-none`, muted color, and
  `disabled` checkbox. Tier badge remains visible for orientation.
- **[user-state.svelte.ts](src/lib/stores/user-state.svelte.ts)** — Added `showSpoilers: boolean` to
  `UserState` (defaults `false`, not persisted) with `toggleShowSpoilers()` method.
- **[toolbar-footer.svelte](src/lib/components/toolbar-footer.svelte)** — Added "Show all spoilers"
  toggle in the filters panel. Integrated into `filtersActive` and reset logic.

---

## 13. ~~Season Animals: Timely Filtering~~ ✅ Done

Added seasonal availability filtering for animal variants, matching the pattern used by almanac and
museum items. The animals page now shows the season/weather toolbar controls.

**Changes made:**

- **[animals/+page.svelte](<src/routes/(category)/animals/+page.svelte>)** — Updated
  `isVariantVisible` to filter by `bornIn` season. Timely mode shows only current-season variants;
  available mode hides out-of-season variants; everything mode shows all.
- **[progress.ts](src/lib/engine/progress.ts)** — Updated `getAnimalsProgress` to compute `filtered`
  count per availability mode, so the progress bar reflects what's actually visible.
- **[toolbar-footer.svelte](src/lib/components/toolbar-footer.svelte)** — Added `/animals` to
  `WORLD_STATE_ROUTES` so the season/weather pill and availability toggle appear on the animals
  page.

---

## 14. ~~Animal Cosmetics: Skip `default` Key~~ ✅ Done

Added `if (cid === "default") continue;` to the cosmetics extraction loop in
[animals.ts](pipeline/src/extractors/animals.ts), matching the existing skip for variants. Pipeline
output dropped from 123 to 115 cosmetics.

---

## 15. ~~Cosmetics: No Sources Shown~~ ✅ Done

Added cosmetic source extraction to the pipeline and restructured the cosmetics page with
sub-category grouping and expandable source details.

**Pipeline changes:**

- **[sources.ts](pipeline/src/extractors/sources.ts)** — Added `extractFestivalCosmetics()` (9
  cosmetics from spring/harvest festival shops, with season restrictions) and
  `extractRenownCosmetics()` (22 cosmetics from renown level rewards). Added `"festival"` and
  `"renown"` to `SourceType`.
- **[cosmetics.ts](pipeline/src/extractors/cosmetics.ts)** — Added `buildSubCategoryMap()` to read
  display names from `$.ui.character_customization`, populates `subCategory` on each cosmetic from
  `ui_sub_category` (e.g., "Hats", "Short Hair", "Boots").
- **[tracker-data.ts](src/lib/types/tracker-data.ts)** — Added `subCategory?: string` to cosmetics
  type; added `"festival"` and `"renown"` source types.
- **[format.ts](src/lib/utils/format.ts)** — Added source labels: `"Festival"` and
  `"Renown Reward"`.

**UI changes:**

- **[cosmetics/+page.svelte](<src/routes/(category)/cosmetics/+page.svelte>)** — Restructured from
  flat slot grouping to nested slot → sub-category `ExpandableSection`s with completion counts
  (e.g., Head → Hats 3/31, Hair Accessories 2/14). Slots with only one sub-category skip nesting.
- **[cosmetics/CosmeticRow.svelte](<src/routes/(category)/cosmetics/CosmeticRow.svelte>)** — New
  colocated component matching the `ItemRow` pattern: cosmetics with sources get an expandable
  chevron showing `ItemDetail` with source type, location, and restriction badges.

**Output:** 31 cosmetics with sources (22 renown + 9 festival), 298 cosmetics with sub-categories
across 10 slots.

---

## 16. ~~Nameless Items: Filter from Pipeline~~ ✅ Done

Items without a `name` field are now skipped in [almanac.ts](pipeline/src/extractors/almanac.ts) and
logged during the pipeline run so they can be reviewed.

**Pipeline output (v0.14.4, 6 nameless items):**

| Item                               | Purpose                           |
| ---------------------------------- | --------------------------------- |
| `other/misc/cosmetic`              | Generic cosmetic container        |
| `other/misc/animal_cosmetic`       | Generic animal cosmetic container |
| `other/misc/pet_cosmetic`          | Generic pet cosmetic container    |
| `other/misc/stinky_stamina_potion` | May be unreleased/internal        |
| `other/misc/horse_potion`          | May be unreleased/internal        |
| `other/misc/lurid_colored_drink`   | May be unreleased/internal        |

Note: `perfect_gift` from the original list now has a name after localization, so it is no longer
filtered. It does not match any almanac tag, so it still doesn't appear in the almanac.

---

## 17. ~~Settings: Show Game Version~~ ✅ Done

Added Harvest Helper app version display alongside the existing game data version on the settings
page. Version string includes the git commit short hash for debugging (e.g. `0.0.1+a3bf912`).

**Changes made:**

- **[svelte.config.js](svelte.config.js)** — Set `kit.version.name` to `${pkg.version}+${commit}`
  using `package.json` version and `git rev-parse --short HEAD`.
- **[settings/+page.svelte](src/routes/settings/+page.svelte)** — Imported `version` from
  `$app/environment` and added a second line: `Harvest Helper v{version}`.

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

## 19. ~~Completed Quests Visibility~~ ✅ Done

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

## 21. Animal Cosmetics: Drop Species Name in Pipeline

All animal cosmetics include the species name in their display name (e.g., "Pink Duck Bow", "Spotted
Cow Bell"). The species name is redundant because cosmetics are already grouped under their animal.
The pipeline could strip the species prefix to produce cleaner labels (e.g., "Pink Bow", "Spotted
Bell").

**Where:** [animals.ts](pipeline/src/extractors/animals.ts) — cosmetic name extraction.

---

## 22. Spoiler UI: Revisit Design

**Status: Needs UX review.**

The current tier-based spoiler system (issue #12) works mechanically but the UI treatment may not be
ideal. Revisit the blur/disabled approach and consider alternatives.

---

## 23. NPC Hearts: Center Content

The NPC heart level display should be horizontally centered within its row. The stepper controls
should remain full-width — only the heart content needs centering.

**Where:** [npcs/+page.svelte](<src/routes/(category)/npcs/+page.svelte>) or the relevant NPC row
component.

---

## 24. Reset Buttons: Mobile Overflow

Reset buttons overflow the viewport width on mobile. They need to stack vertically, matching the
layout pattern used by other cards on the settings page.

**Where:** [settings/+page.svelte](src/routes/settings/+page.svelte) or the relevant reset card
component.

---

## 25. Toolbar: Extra Bottom Padding

The bottom toolbar has unnecessary extra bottom padding that should be removed.

**Where:** [toolbar-footer.svelte](src/lib/components/toolbar-footer.svelte)

---

## 26. Stepper Component: Center Content

The renown stepper has off-center content. This should be fixed at the component level — the stepper
should always be full-width with its content centered. This will also fix any other steppers with the
same issue (e.g., mines floor stepper).

**Where:** [stepper.svelte](src/lib/components/stepper.svelte)

---

## 27. Item Row: Source Tap Affordance

Item rows that have source details (expandable chevron) have no visual affordance indicating they are
tappable. Users don't know they can tap to see sources. Needs a subtle visual hint — e.g., a chevron
icon, background highlight, or other indicator.

**Where:** Item row components across pages (e.g.,
[CosmeticRow.svelte](<src/routes/(category)/cosmetics/CosmeticRow.svelte>), and similar).

---

## Questions for Review

No open questions — all clarifications have been incorporated above.
