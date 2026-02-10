# Harvest Helper — Architecture & Design Planning

## Vision

A mobile-first companion web app for **Fields of Mistria** that helps players track progress toward 100% completion — used on their phone while playing on PC.

**Core experience**: Tracker-first. "What do I still need to do?" not "What is this item?"

Reference data supports the tracker (e.g., tapping an item shows where to find it), but the primary UX is about surfacing what's incomplete and what's actionable _right now_.

---

## Decisions Made

### D1: Target user = Completionist, building for public release

Building for completionists first. The app should answer: "What's left? What can I do this season/today?" Designed for public release — other FoM players should be able to use this too.

### D2: Tracker-first, reference supports it

Reference data (sources, locations, prices) is accessed _in context_ of tracking, not as a standalone wiki. We don't need a full almanac browsing experience — we need "I haven't shipped this item yet → where do I get it?"

### D3: Data pipeline exists and should be preserved

TypeScript pipeline in `pipeline/`: `fiddle.json` (flat slash-key format, ~7MB) → parse → localize → extract → `tracker-data.json` (~430KB). Drop in new fiddle.json + localization.json, run `npm run pipeline`, commit. Single version only — latest game version is all that matters.

### D4: Player.json import for bootstrapping

The game's save file (`player.json`) contains rich completion data that can auto-populate the tracker. This is a killer onboarding feature: import your save, see your progress instantly.

### D5: One list, many views

There is one canonical list: **everything you haven't done yet** (~3000 items). No separate "my lists" vs "progress" — they're the same data viewed differently. Completion % is just a summary of the checklist.

### D6: No guidance

The app doesn't tell you what to do. No "today's tasks," no priority sorting. The game has no time pressure. The app provides tools (filters, search, world state) and the player decides what to work on.

### D7: Filter-driven UI with 3-way availability toggle

World state (season, weather) is set by the player. A 3-way toggle controls how items are filtered:

- **Timely** — only items restricted to current season/weather/time (short, focused list)
- **Available** (default) — all items accessible given current world state
- **Everything** — all incomplete items regardless of world state

### D8: Search is the primary interaction

Always-visible search bar. Used for both lookup ("where do I find X?") and recording progress ("just caught a fairy bee" → search → check off). Not a separate tab — persistent on the main screen.

### D9: Tech stack

- **SvelteKit 2 + Svelte 5** (runes) ✅
- **shadcn-svelte** (copy-paste components, slate base color) ✅
- **Tailwind 4** (Vite plugin, CSS-based config) ✅
- **Cloudflare Pages** (adapter-cloudflare) ✅
- **PWA** (manifest + service worker) ✅
- **ESLint 9** (flat config, strictTypeChecked, perfectionist) ✅
- **Prettier** (svelte + tailwind plugins) ✅

### D10: Completed items hidden by default

Completed items are hidden to keep focus on what's left. Toggle available to show them.

### D11: Fresh start

Hard reset the repo. Blow away existing code and git history. Start from scratch with the new architecture.

---

## Completion Categories

The "100%" goal breaks down into 9 categories:

| #   | Category                        | What to track                                                                                                   | player.json field(s)                                                   | Notes                                                             |
| --- | ------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1   | **Museum donations**            | Donate all items to 4 wings (archaeology, flora, insect, fish)                                                  | ❓ Not obvious in player.json — investigate on gaming PC               | Need to figure out how donations are tracked                      |
| 2   | **Almanac (own 1 of each)**     | Artifacts, blacksmithing, bugs, crops, fish, diving, ranching, cooked dishes, forageables, furniture, materials | `items_acquired` (1700+ items)                                         | Includes having all recipes (`recipe_unlocks`, `recipes_created`) |
| 3   | **Animals (every color)**       | Every color variant of every animal type                                                                        | `animal_variant_unlocks` + ref: `$.ranching.animals.{animal}.variants` | Colors ≠ cosmetics — variants are separate from hats/bows         |
| 4   | **NPC max hearts**              | Max relationship with every NPC                                                                                 | ❓ Not in player.json — investigate on gaming PC                       | May need manual tracking                                          |
| 5   | **Cosmetics (player + animal)** | All outfits/accessories                                                                                         | `cosmetic_unlocks` (270+), `animal_cosmetic_unlocks`                   | Player cosmetics + animal cosmetics separately                    |
| 6   | **Skills maxed**                | All 9 skills to max level                                                                                       | `skill_xp` (9 skills with XP values)                                   | Need to know XP thresholds for max level                          |
| 7   | **Town renown maxed**           | Max renown level                                                                                                | `stats.renown` (11682.0)                                               | Need to know max renown threshold                                 |
| 8   | **All quests complete**         | Story, heart, fetch, crown quests                                                                               | ❓ `inbox` tracks mail not quests; `progression` has milestones        | Quest completion tracking unclear                                 |
| 9   | **Mines complete**              | Reach bottom of mines, unlock all spells                                                                        | `spells_learned` (4 spells), `progression` milestones                  | May overlap with story quests                                     |

---

## Restriction Taxonomy

Restrictions on items/sources break down into distinct types:

| Type                     | Examples                               | Changes?                        | UI implication                                                                      |
| ------------------------ | -------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------- |
| **Timely**               | Season, weather, time of day           | Changes outside player control  | Most important for the 3-way toggle — these are "do it now or wait"                 |
| **Spoilable progress**   | Perks, animal unlocks, fixed buildings | Player chose them, could respec | Part of world state — player can set these                                          |
| **Unspoilable progress** | Seen season, skill level               | Only goes up, never lost        | Less important to filter by — if you don't have the skill, you'll get it eventually |
| **Info**                 | Fish shadow size                       | Doesn't change                  | Just display as reference, not filterable                                           |

---

## Information Architecture

**Home screen layout:**

```
┌─────────────────────────────┐
│  🔍 Search items...         │  ← persistent search bar
├─────────────────────────────┤
│  [Spring ▾] [Rainy ▾]      │  ← world state (persisted)
│  ○ Timely  ● Available  ○ All │  ← 3-way availability toggle
├─────────────────────────────┤
│  Categories                 │  ← 9 cards with progress %
│  ┌──────┐ ┌──────┐         │     filtered by toggle above
│  │Museum│ │Almanac│ ...     │     tapping → category drill-in
│  │ 72%  │ │ 45%  │         │
│  └──────┘ └──────┘         │
│  ┌──────┐ ┌──────┐         │
│  │Recipe│ │Animal│ ...     │
│  │ 30%  │ │ 60%  │         │
│  └──────┘ └──────┘         │
└─────────────────────────────┘
         [Settings ⚙]
```

**3-way toggle behavior:**

- **Timely**: Category cards show only counts of season/weather-restricted incomplete items. "Museum: 3 timely" means 3 museum items are season/weather-restricted to right now.
- **Available** (default): Cards show all incomplete items accessible given world state.
- **Everything**: Cards show total incomplete items regardless of restrictions.

**Primary flows:**

1. **Check off a specific thing**: Search → find item → tap checkbox
2. **What's timely?**: Set world state → switch to "Timely" → see short focused list
3. **Work on a category**: Tap category card → see incomplete items → check them off
4. **End-game overview**: Switch to "Everything" → see all remaining items across categories

**Category drill-in view:**

```
┌─────────────────────────────┐
│  ← Back        Museum  72%  │
│  🔍 Search within...        │
│  ○ Timely  ● Available  ○ All │  ← same toggle, inherited
├─────────────────────────────┤
│  ▸ Archaeology Wing   18/24 │  ← sub-categories where applicable
│  ▸ Flora Wing         12/15 │
│  ▸ Insect Wing         8/20 │
│  ▸ Fish Wing          14/18 │
└─────────────────────────────┘
```

**Item detail (expand in-place or bottom sheet — TBD):**

```
┌─────────────────────────────┐
│  ☐ Fairy Bee                │
│  Category: Bugs → Museum    │
│  ──────────────────────     │
│  Sources:                   │
│  • Bug catch @ Meadow       │
│    🍂 Fall only             │
│    ☀ Calm weather           │
│    🕐 6:00-18:00            │
│  ──────────────────────     │
│  Actions: Ship · Donate     │
└─────────────────────────────┘
```

---

## Player.json Import

**What we CAN auto-import:**

- ✅ Items acquired (`items_acquired` — 1700+ items)
- ✅ Recipes unlocked & created (`recipe_unlocks`, `recipes_created`)
- ✅ Animal color variants (`animal_variant_unlocks`)
- ✅ Player cosmetics (`cosmetic_unlocks`)
- ✅ Animal cosmetics (`animal_cosmetic_unlocks`)
- ✅ Skill XP (`skill_xp`)
- ✅ Renown (`stats.renown`)
- ✅ Spells learned (`spells_learned`)
- ✅ Progression milestones (`progression`)
- ✅ Items sold/shipped (`items_sold`)

**What we CANNOT auto-import (needs investigation on gaming PC):**

- ❓ Museum donations — not found in player.json, may be in a different save file
- ❓ NPC heart levels — not in player.json
- ❓ Quest completion state — unclear tracking mechanism

**TODO when on gaming PC:**

- [ ] Look for other save files that might contain donation/NPC/quest data
- [ ] Check if there's a world state file separate from player state
- [ ] Document how to extract player.json (so other users can do it too)

---

## Data Pipeline

```
Game update drops fiddle.json into pipeline/input/
        ↓
npm run pipeline (TypeScript via tsx)
        ↓
parse-fiddle.ts    → flat slash-keys → nested object (32K keys kept, 14K visual/audio skipped)
        ↓
localize.ts        → resolve i18n keys → English strings (semver fallback chain)
        ↓
extractors/*.ts    → 10 extractors, one per completion category + sources
        ↓
tracker-data.json  → pipeline/output/ (pretty, 706KB) + src/lib/data/ (minified, 428KB)
```

### Pipeline extractors

| Extractor      | Source in fiddle         | Output                                                    |
| -------------- | ------------------------ | --------------------------------------------------------- |
| `museum.ts`    | `museum_wings`           | 4 wings → 69 sets → 344 item IDs                          |
| `almanac.ts`   | `items`                  | 67 categories, 1903 items (crops/forage split into 3)     |
| `animals.ts`   | `ranching.animals`       | 8 types, 97 variants (32 defaults skipped), 119 cosmetics |
| `npcs.ts`      | `npcs`                   | 34 NPCs (name, birthday, dateable)                        |
| `cosmetics.ts` | `player_assets`          | 253 player cosmetics (name, slot)                         |
| `skills.ts`    | `skills`                 | 9 skills (id → name)                                      |
| `renown.ts`    | `renown`                 | 11 ranks × 10 levels                                      |
| `quests.ts`    | `quests`                 | 246 quests (story/heart/fetch/crown)                      |
| `mines.ts`     | `dungeons` + `spells`    | 5 biomes, 99 floors, 4 spells                             |
| `sources.ts`   | stores, fish, bugs, etc. | 1611 items with 2190 sources (forage sources fixed)       |

### Deliberately excluded (add later for reference section)

- NPC loved/liked gifts
- Quest rewards, NPC associations, requirements
- Renown rewards
- Spell costs
- Item sell/buy prices

---

## Data Architecture

### Game data (`tracker-data.json` — loaded once, cached)

The "universe" of all completable things. Structured by category. Full TypeScript types in `src/lib/types/tracker-data.ts` (branded ID types for type safety, shared between pipeline and app).

```
TrackerData {
  version: "0.13.4",
  generatedAt: "2026-02-07T...",
  museum:    Record<WingId, { name, sets: Record<SetId, { name, items: ItemId[] }> }>,
  almanac:   Record<category, Record<ItemId, { name }>>,
  animals:   Record<AnimalId, { name, variants: Record<VariantId, {...}>, cosmetics }>,
  npcs:      Record<NpcId, { name, birthday, dateable }>,
  cosmetics: Record<CosmeticId, { name, slot, defaultUnlocked }>,
  skills:    Record<SkillId, string>,
  renown:    { levelsPerRank, ranks },
  quests:    Record<type, Record<QuestId, { name }>>,
  mines:     { biomes, maxFloors, spells },
  sources:   Record<ItemId, Source[]>,       // where/how to obtain each item
  items:     Record<ItemId, { name, category }>,  // master item registry
}
```

### User data (localStorage, exportable)

The player's progress. Shape TBD but roughly:

```
{
  version: "1",
  worldState: { season: "fall", weather: "calm" },
  completed: {
    museum: Set<ItemId>,
    almanac: Set<ItemId>,
    recipes: { unlocked: Set<RecipeId>, created: Set<RecipeId> },
    animals: { [animal]: Set<VariantId> },
    npcs: { [npcId]: number },  // heart level
    cosmetics: { player: Set<CosmeticId>, animal: { [animal]: Set<CosmeticId> } },
    skills: { [skill]: number },  // XP
    quests: Set<QuestId>,
    renown: number,
    mines: { floor: number, spells: Set<SpellId> }
  }
}
```

---

## Item Visual Treatment

Items in the tracker should carry visual indicators based on their restriction type and availability:

| Indicator       | What it means                                                         | Visual approach                                                                                    |
| --------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Season**      | Only available in specific season(s)                                  | Small season icon(s) — 🌸🌞🍂❄ or similar                                                          |
| **Weather**     | Only available in specific weather                                    | Weather icon — ☀🌧⛈ etc.                                                                           |
| **Time**        | Only available at certain hours                                       | Clock/time icon with range                                                                         |
| **Fish shadow** | Shadow size needed                                                    | Size indicator (info only)                                                                         |
| **Unavailable** | Not accessible given current world state                              | Dimmed/greyed treatment — clearly "not now"                                                        |
| **Spoiler**     | Requires progress the player may not have (perks, buildings, animals) | Distinct treatment (lock icon? subtle badge?) to indicate "you may need to unlock something first" |

All items in the list should be visually scannable — a player should be able to tell at a glance which items are timely, which are available but unrestricted, and which are currently locked.

---

## Open Questions (remaining)

### UX details (can resolve during implementation)

- Item detail: inline accordion vs bottom sheet on mobile?
- World state filters should persist across sessions (leaning yes)
- How granular should world state be beyond season+weather? (Start with season+weather, add perks/skills/buildings later if needed)
- Exact visual design for the restriction indicators and unavailable/spoiler treatments

### Data gaps (investigate on gaming PC)

- [ ] Museum donation tracking — where is it in the save files?
- [ ] NPC heart levels — where is it in the save files?
- [ ] Quest completion state — how does the game track this?
- [ ] Skill XP thresholds for max level
- [ ] Renown max threshold
- [ ] Document how to extract save files (for other users)
- [ ] Audit fiddle.json for complete universe of items per category

---

## Implementation Plan

### Phase 1: Scaffold ✅

- [x] Hard reset repo (fresh git history)
- [x] SvelteKit + Svelte 5 + Tailwind 4 + shadcn-svelte setup
- [x] Cloudflare Pages adapter
- [x] PWA manifest + service worker (cache-first assets, network-first pages)
- [x] `pipeline/` directory (committed to git, `input/` and `output/` gitignored)
- [x] Strict ESLint: `strictTypeChecked` + perfectionist (auto-sorted imports, objects, types)
- [x] Prettier: consistent formatting with svelte + tailwind plugins

### Phase 2: Data pipeline ✅

- [x] TypeScript pipeline in `pipeline/` (tsx, not Python)
- [x] Shared types: `src/lib/types/tracker-data.ts` (branded IDs, enums, TrackerData interface)
- [x] Parse fiddle.json (flat slash-keys → nested object, skip visual/audio data)
- [x] Localize strings (same-version → semver fallback → snake_case→Title Case)
- [x] 10 extractors for all completion categories + sources
- [x] App-side loader: `src/lib/data/index.ts` (static import, typed)
- [x] ESLint pipeline overrides (allow console, relax type strictness for game data)

### Phase 3: Core tracker UI ✅

- [x] Home screen: search bar + world state selectors + 3-way toggle + category cards with progress %
- [x] Category drill-in views (9 routes) with sub-categories via `ExpandableSection`
- [x] Item list with restriction badges (season/weather/time emoji indicators)
- [x] Item detail: expandable source list with green/red availability dots
- [x] Check-off functionality with localStorage persistence (debounced 300ms save)
- [x] Cross-category search (prefix-match ranking, max 50 results, 200ms debounce)
- [x] Dark mode with system/light/dark toggle + FOUC prevention
- [x] shadcn-svelte component library (button, card, checkbox, toggle-group, select, etc.)
- [x] Engine layer (`src/lib/engine/`): availability filtering, progress calculation, search — pure functions, no side effects
- [x] Reactive state via Svelte 5 `$state`/`$derived` runes — single `userState` store persisted to localStorage
- [x] Default-unlocked cosmetics and animal variants pre-populated on first load

### Phase 4: Player.json import ✅

- [x] Import engine (`src/lib/engine/import-save.ts`): parse, validate, map player.json → CompletedState
- [x] Union merge strategy in `userState.mergeFromSave()` — adds items, never removes existing progress
- [x] Almanac import uses `items_acquired ∪ items_sold ∪ recipes_created` (items_acquired is NOT cumulative — items_sold fills the gaps)
- [x] Settings page (`/settings`) with file picker, import results summary, warnings
- [x] Backup export/restore (full state JSON download/upload)
- [x] Reset all progress with confirmation
- [x] Settings gear icon on home page
- [x] Import coverage: almanac, cosmetics, animal variants, animal cosmetics, spells
- [x] Not importable (documented in UI): museum donations, NPC hearts, quests (not in player.json), skills/renown (XP thresholds unknown), mine floor (only milestones)

#### Fixes

##### UI

- [ ] Remove diving shadow size tags on "Materials"
- [ ] Add search to individual category pages
- [ ] Only two categories (Museum & Almanac) are affected by availability, maybe they should be more clearly differentiated? → **needs input**
- [ ] Maybe add a way to indicate that an entire museum set is done (at least until that becomes importable) → **needs input**
- [ ] Mute repetitive fetch quest "Request for( a)" prefix (preserves "Important" distinction) [currently doesn't work on quests that don't have "a"]
- [ ] Home page tiles could still have a little les vertical padding, at least on mobile
  - Maybe on mobile, the rows could be [Icon + Name] / [Bar + Count]?
  - Make the name one size larger please
- [ ] Idea: With 9 categories, this feels like a 3x3 grid would make a lot of sense? → **needs input**
- [ ] Also apply edges to theme switcher in settings menu
- [ ] Are we still using the shadcn dropdown, or can we remove that whole component?
- [ ] "Show completed" doesn't do anything in Animals
- [ ] Crops don't show season
- [ ] Counts don't update when changing availability toggle
- [ ] Typing in the search bar still doesn't give any feedback for a second
- [ ] It's not obvious that clicking an item name will show the sources
- [ ] Could we switch from emojis to Lucide icons? Those will show the amber vs sky colors better
- [ ] Don't show weather icons if item available in all weathers
- [ ] Sort animal variants within tiers (tier 1 at top, tier 6 at bottom)
  - Also sort seasonal variants in season order (spring, summer, fall, winter)

##### Data

- [ ] NPCs aren't "checked off", the player builds the relationship level → **needs input**
- [ ] Skills have levels (cap at 60), not "checked off" → **needs input**
- [ ] Categorize crops & forage by season → **partially done** (forage sources now have season data; crop season needs seed→crop mapping)
- [ ] Quests: obtained vs completed two-state tracking → **needs input**
- [ ] "Acorn" has two sources for "Store / Balor" (probably more of this)
- [ ] Furniture > Basic Chest Set has 15 entries for "Basic Wood Chest" (probably more of this)
- [ ] Capitalize cosmetics categories
- [ ] Remove treasure boxes from Fish

##### Questions & Design Decisions Needed

These items require your input or need investigation on the gaming PC.

**1. NPC Relationship Levels**
The current NPC page uses checkboxes (done/not done), but NPCs have relationship levels 1-8. Design questions:

- Should it be a slider, stepper (+/- buttons), or direct input like renown?
  - I was thinking it could be like a stepper with -/+ buttons on the sides? The in-game UI uses 2 rows of 6 icons each. I got another Claude Code to identify the closest Tailwind colors:

    ```
    Row 1 (top):
    1. violet-600
    2. indigo-700
    3. blue-600
    4. sky-400
    5. green-500
    6. lime-400

    Row 2 (bottom):
    7. amber-400
    8. yellow-300
    9. orange-500
    10. orange-600
    11. red-500
    12. rose-700

    A few judgment calls worth flagging:
    - Gems 2 vs 3 are both blue but gem 2 reads more indigo/navy — indigo-700 vs blue-600 is a closer call than the others
    - Gem 12 (bottom right) looks more like a deep crimson/ruby, which sits between rose-700 and red-800
    - Gems 7/8 are both gold-ish; amber-400 vs yellow-300 distinguishes the warmer deeper gold from the brighter yellow
    ```

- Romanceable NPCs use hearts, non-romanceable use gems — should the UI reflect this distinction visually?
  - Yes of course! The closest Lucide icon is probably octagon though.
- The fiddle data has `heart_point_values` with 4 threshold values. These may correspond to the 8 levels (every 2 thresholds = 1 level?). Need to verify mapping.
  - Dunno what that object is for, not this though. You should use the values in `npc_heart_point_table`.
- NPC hearts are NOT in player.json — manual tracking only (for now).
  - Yes

**2. Skill Levels & Tiers**
Skills currently show as checkboxes but should be level 1-60. Design questions:

- Same input style as renown (click to type, +/- buttons)?
  - Seems reasonable
- The fiddle has `skills` data but only 9 skill names, no XP thresholds or tier breakpoints.
  - The tier breakpoints are in `$.ui.skill_menu.defaults.category.level_requirements`.
- The PLANNING.md mentions tiers unlock perks — should the UI show tier progress or just the level number?
  - Maybe some small adjustment for the tiers, but it doesn't have to be called out.
- Skill XP thresholds for leveling are NOT in the fiddle data. Do you know these, or can we extract from the game?
  - Hmm, I just explored the fiddle & the wiki, no dice.
- Skills are importable from player.json (`skill_xp`) but we need to know the XP→level formula.

**3. Quest Two-State Tracking (Obtained vs Completed)**
Currently quests are just checked off. The request is for two states: obtained (active) → completed.

- Should this be: unchecked → active (partial fill/different icon) → completed (full check)?
- Or a dropdown/toggle per quest?
  - My thought is that 95% of the actions will be to move to the next state, but that there will be some error handling where the user needs to undo bc they started the wrong quest.
- Quests never expire or fail, so the flow is strictly: not obtained → obtained → completed.
  - Yes
- What visual treatment for "obtained but not completed"? A half-check? Different color? Progress dot?
  - The in-game quest icon is a ! in a speech bubble coming out of an open envelope, so we could use Mail / MailOpen / MailCheck? Or CircleDashed / Circle / CircleCheckBig? Just thoughts

**4. Availability Differentiation**
Only Museum and Almanac items are affected by the season/weather availability system. The other 7 categories (Animals, NPCs, Cosmetics, Skills, Renown, Quests, Mines) have no seasonal restrictions.

- Should categories unaffected by availability hide the world state/toggle controls?
- Or should they show the controls greyed out with a message like "Not affected by season"?
- Current behavior: Museum & Almanac show controls, others don't.
  - I like the current take!

**5. Museum Set Quick-Complete**
For museum sets, it might be useful to mark an entire set as complete at once (especially before save import is possible for museum data).

- A "mark all" button per set? Per wing?
  - Oh just per set. I'm thinking about entering my museum donations manually.
- Risk: accidentally completing a whole set. Maybe require long-press or confirmation?
  - That's fine, just undo the set or the items underneath. Shouldn't be a problem.

**6. 3×3 Grid Layout**
With 9 categories, a 3×3 grid is tempting. Current layout is a 2-column grid that scrolls.

- 3×3 would fit everything on one screen but tiles would be very small on narrow phones.
- Could use a responsive approach: 3×3 on wider screens, 2-col on narrow.
- The tiles are already quite compact after the latest changes.
  - True, let's keep this for now.

**7. Crop Season Association**
Crops (34 items) don't have season data on the items themselves. Season lives on the _seed_ items (via store seasonal stock). Approach:

- Pipeline: link each crop to its seed via the `crop_object` field on seeds, then inherit the seed's store season.
  - Sounds good, make it so
- Display: group crops by season in the Almanac, similar to how museum has sets.
- 20 forageable items (herbs/flowers like Basil, Daffodil, Tulip) can be BOTH grown from seeds AND foraged in the wild — these are correctly in "Forageables" since they can be found without farming.
  - Yeah, let's leave them in Forageables but also add a source for growing them

**8. Category Page Search**
The PLANNING.md wireframe shows a search bar within each category page. Options:

- Same search bar as home, but filtered to current category?
  - Yep, this.
- Or a simpler text filter (no cross-category results)?
- Should it search item names only, or also source descriptions?
  - Just names, like home search.

### Phase 5: Polish

- PWA install experience
- Mobile UX refinement
- Performance (virtualized lists for large categories)

### Future

#### Requires human

- [ ] Investigate data sources for non-importable data: museum donations, NPC hearts, quests (not in player.json), skills/renown (XP thresholds unknown), mine floor (only milestones)
