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

### Phase 5: Polish ✅

- [x] **PWA install experience**
  - [x] Generate proper icon sizes (192, 512) from favicon for manifest
  - [x] Apple touch icon (180px) for iOS home screen
  - [x] Apple mobile web app meta tags (capable, status bar style, title)
  - [x] `viewport-fit=cover` for safe area inset support
  - [x] Offline fallback page (pre-cached by service worker)
  - [x] Fixed manifest.json: correct sizes, split any/maskable purpose, orientation, categories
  - [x] ⚠️ **Note:** Favicon is a 128px grayscale placeholder — needs a real app icon designed
- [x] **Mobile UX refinement**
  - [x] Safe area insets: top padding on home, settings, category headers; bottom on root layout
  - [x] Prevent iOS input zoom (`font-size: max(16px, 1em)`)
  - [x] Disable tap highlight and pull-to-refresh overscroll for native PWA feel
  - [x] NPC +/- buttons: increased to size-8 (32px) touch targets, added active state
  - [x] NPC hearts: shrank icons to size-4 (fits iPhone SE), made individually tappable to set level
  - [x] Skill +/- buttons: increased to size-8, bigger icons
  - [x] Skill level text: taller tap target (h-8)
  - [x] Sticky category headers: added bottom border for scroll separation
- [x] **Performance**
  - [x] Pre-filter almanac items before `{#each}` iteration (was filtering inside loop)
  - [x] "Show N more..." progressive disclosure: caps at 50 items per section, button to reveal rest
  - [x] Decided against full virtualization: sections are collapsed by default (DOM stays small), and progressive disclosure handles the furniture sets (95+ items)
- [x] **UI polish**
  - [x] Smooth opacity transition on item completion state change
  - [x] Active press state on category cards (`active:bg-accent/70`)
  - [x] "All done!" empty state for completed categories (almanac, museum, cosmetics, animals)
  - [x] Increased item row vertical padding for touch comfort
- [x] **Dev tooling**
  - [x] Moved lint-staged config to JS file to exclude service-worker.ts from eslint (allowDefaultProject breaks with lint-staged temp paths — a known issue with SvelteKit's tsconfig setup)

### Phase 6: Cross-device transfer (QR code)

The core UX problem: `player.json` lives on the gaming PC, but the tracker is used on a phone as a second screen. The player needs a way to get their imported progress from PC → phone without manually transferring files.

**Strategy:** Import `player.json` on PC browser → generate QR code of compressed state → scan on phone to merge.

**Why QR works:** We're not encoding the raw `player.json` (megabytes) — we're encoding the _processed_ `CompletedState`, which is just sets of short string IDs + a few numbers. Compressed, this should fit in a single QR code (max ~2.9KB binary / ~4.3KB alphanumeric).

#### Step 0: Measure compressed state size ✅

Measured with real player.json (1898 almanac items, 237 cosmetics, 75 variants, 58 animal cosmetics, 4 spells).

**JSON approach fails**: Even with minification + deflate, CompletedState is ~10.7KB compressed — far over the 2.9KB QR binary limit. The verbose string IDs (`alda_bronze_sword`, `back_gear_dragon_cleric_cape`) are the problem.

**Bitfield encoding works**: Both app and phone know the full item universe from `tracker-data.json`. Encode completion as 1 bit per item in a deterministic sorted order:

- Almanac: 238 bytes (1898 items), Cosmetics: 21 bytes, Variants: 12 bytes, Animal cosmetics: 15 bytes
- **Total raw: 287 bytes → compressed: 66 bytes → base64url: 88 chars** ✅
- Worst case (100% completion): compresses to 13 bytes (all 1s = trivially compressible)
- Even with scalar fields (NPC levels, skills, quests, renown, mines) added, well under 2.9KB

**Decision: Use bitfield encoding.** Both sides derive the same sorted item order from tracker-data.json, so the QR payload is just a version byte + compressed bitmasks + scalar values. Single QR code, no relay infrastructure needed.

#### Step 1: Transfer UI in Settings

- [x] Add "Transfer to Another Device" section in Settings (always visible, not just post-import)
- [x] **Send side (PC):** "Generate QR Code" button → serializes + compresses `CompletedState` → renders QR code on screen
- [x] **Receive side (phone):** "Scan QR Code" button → opens camera via `qr-scanner` library → decodes → decompresses → calls `userState.mergeFromSave()`
- [x] Show merge results summary (same UI pattern as player.json import: "Added X almanac items, Y cosmetics...")

#### Step 2: Post-import prompt

- [x] After successful `player.json` import on Settings page, show a callout: _"Playing on your phone? Transfer this progress to your mobile device →"_ with a button that jumps to the QR transfer section
- [x] Only show if user agent looks like a desktop browser (simple heuristic: screen width via `matchMedia("(min-width: 768px)")`)

#### Step 3: Encoding format ✅

- [x] Implement bitfield encoding/decoding in `src/lib/engine/transfer.ts`
- [x] Binary format: `[version:1][deflate([almanacBits][cosmeticBits][variantBits][animalCosmeticBits][museumBits][spellBitmask:1][mineFloor:1][renown:2][npcLevels:34×4bits=17][skillLevels:9×1byte=9][questStates:246×2bits=62])]`
- [x] Sorted item order derived from tracker-data.json (deterministic, both sides compute the same order)
- [x] Omit default-unlocked cosmetics/variants (re-derived on load)
- [x] Version byte prefix for future format changes
- [x] Encode to base64url for QR alphanumeric mode; entire payload fits in single QR code (~88-300 chars)

#### Step 4: QR scanning ✅

- [x] Using `qr-scanner` library (~59KB, uses native BarcodeDetector when available, WebWorker fallback)
- [x] Handle permissions gracefully (camera access prompt, denial state with helpful message)
- [x] Image upload fallback: "Or scan from a screenshot..." button for non-camera devices

#### Future improvement: Short code relay

For an even smoother experience (no camera needed, works computer-to-computer):

- PC imports `player.json` → clicks "Share via Code" → compressed state uploads to a Cloudflare Worker endpoint → returns a 6-character code (stored in KV, expires in 10 minutes, auto-deletes after first retrieval)
- Phone enters code in Settings → Worker returns compressed state → merge
- Implementation: ~50 lines of Cloudflare Worker code + KV namespace. Already deploying to Cloudflare Pages, so adding a Worker is trivial.
- Could optionally encrypt client-side with a user-chosen PIN for extra privacy.
- Deferred because QR is zero-infra and sufficient for the phone use case.

### Future

#### Requires human

- [ ] Investigate data sources for non-importable data: museum donations, NPC hearts, quests (not in player.json), skills/renown (XP thresholds unknown), mine floor (only milestones)
- [ ] Design a real app icon (current favicon is a 128px grayscale Svelte logo placeholder)
