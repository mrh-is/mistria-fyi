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

Python pipeline: `fiddle.json` → clean → localize → catalog.json (~888KB) + condensed_data.json (~48KB). Automated, versioned. Goal: drop in new fiddle.json, run pipeline, deploy. Pipeline will be moved into this repo.

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

### Current (separate repo on Google Drive)

```
Game update drops fiddle.json
        ↓
process_new_fiddle.py (auto-version, clean)
        ↓
    cleaned_fiddle.json (3.6MB)
        ↓
    localized_fiddle.json (with i18n)
        ↓
  ┌─────┴─────┐
  ↓            ↓
catalog.json  condensed_data.json
 (888KB)       (48KB)
  ↓
Copied to harvest-helper/static/versions/{ver}/
```

### Proposed (in this repo)

```
Game update drops fiddle.json into pipeline/input/
        ↓
Pipeline (Python, in this repo: pipeline/)
        ↓
tracker-data.json → src/lib/data/ or static/
 (~100-200KB, exactly what the app needs)
```

### Pipeline work

- [ ] Move pipeline scripts from Google Drive into `pipeline/` directory
- [ ] Redesign output format: `tracker-data.json` schema based on 9 completion categories
- [ ] Add player.json → user progress parser (client-side, in the app)
- [ ] Drop fiddle.json and full catalog from the app (only used in pipeline)

---

## Data Architecture

### Game data (`tracker-data.json` — loaded once, cached)

The "universe" of all completable things. Structured by category:

```
{
  version: "0.13.4",
  museum: { wings: { archaeology: { sets: [...] }, ... } },
  almanac: { artifacts: [...], bugs: [...], crops: [...], ... },
  recipes: { cooking: [...], crafting: [...] },
  animals: { cow: { variants: [...] }, ... },
  npcs: [ { id, name } ],
  cosmetics: { player: [...], animal: { cow: [...], ... } },
  skills: { cooking: { maxXp: N }, ... },
  quests: { story: [...], heart: [...], fetch: [...], crown: [...] },
  renown: { maxLevel: N },
  mines: { maxFloor: N, spells: [...] },
  sources: { [itemId]: [ { type, locations, restrictions } ] }
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

### Phase 2: Data pipeline

- Move pipeline scripts from Google Drive into `pipeline/`
- Design `tracker-data.json` schema based on 9 completion categories
- Generate `tracker-data.json` from latest fiddle.json
- Load & cache in the app

### Phase 3: Core tracker UI

- Home screen: search bar + world state selectors + 3-way toggle + category cards with progress %
- Category drill-in views with sub-categories
- Item list with restriction indicators and visual treatments
- Item detail (sources, restrictions, actions)
- Check-off functionality with localStorage persistence

### Phase 4: Player.json import

- Client-side parser for player.json
- Import flow in settings
- Map player.json fields to user progress state

### Phase 5: Polish

- Export/import user progress (backup)
- PWA install experience
- Mobile UX refinement
- Performance (virtualized lists for large categories)
