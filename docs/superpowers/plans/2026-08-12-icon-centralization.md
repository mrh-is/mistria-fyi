# Icon centralization implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize shared, semantically meaningful icon mappings through a namespaced `Icon.*`
component system, so duplicated icon records (season, weather, source, category, etc.) live in one
place and call sites speak domain types instead of Lucide names. Single-use, single-file icons
(settings actions, app identity, transfer flow) remain as direct Lucide imports; this is an
intentional scope boundary, not an oversight.

**Architecture:** A barrel module at `$lib/components/icon/index.ts` exports a namespaced `Icon`
object with variant sub-components (`Icon.Season`, `Icon.Source`, etc.). Each variant is a thin
`.svelte` component whose props are domain types (`Season`, `RecipeSource["type"]`, etc.) plus
`LucideProps` for customization. The icon-to-Lucide mappings live in a shared
`$lib/components/icon/icon-maps.ts` module. `icon-maps.ts` is the only non-vendored file that
imports from `@lucide/svelte`. Some call sites also import raw maps/functions from `icon-maps.ts`
when they need the component reference for dynamic rendering (e.g., iterating over seasons, building
derived tile arrays).

**Tech stack:** SvelteKit 2, Svelte 5 (runes), TypeScript (strict), `@lucide/svelte` v1.31

## Global constraints

- **Centralized icons** import only from `$lib/components/icon/`. Single-use icons may still import
  `@lucide/svelte` directly.
- `LucideProps` and `LucideIcon` are re-exported from the barrel so call sites can type icon-prop
  forwarding without importing Lucide.
- Follow existing code style: `consistent-type-imports`, `perfectionist` sort rules, double quotes,
  100-char width, kebab-case files, PascalCase components.
- Run `pnpm run check` and `pnpm run lint:fix` after every task.
- The existing `source-icon.svelte` and `source-icons.ts` from the PR on branch
  `51-source-icon-component` will be superseded by this work. Remove them and replace with the new
  `icon/` structure.
- Swap `FishingHook` → `FishingRod` for `treasure_chest` sources (closes #53).

---

### Task 1: Icon maps module & barrel

Create the centralized icon mapping data and the `Icon` namespace barrel. This is the foundation
everything else builds on.

**Files:**

- Create: `src/lib/components/icon/icon-maps.ts`
- Create: `src/lib/components/icon/icon-source.svelte`
- Create: `src/lib/components/icon/icon-season.svelte`
- Create: `src/lib/components/icon/icon-weather.svelte`
- Create: `src/lib/components/icon/icon-category.svelte`
- Create: `src/lib/components/icon/icon-completion.svelte`
- Create: `src/lib/components/icon/icon-restriction.svelte`
- Create: `src/lib/components/icon/icon-progress-mark.svelte`
- Create: `src/lib/components/icon/icon-ui.svelte`
- Create: `src/lib/components/icon/index.ts`

**Interfaces:**

- Produces:
  - `SOURCE_ICON: Record<RecipeSource["type"], LucideIcon>` — recipe source type → icon
  - `SOURCE_FILTERS: SourceFilter[]` — filter chip definitions for recipe toolbar
  - `SEASON_ICON: Record<Season, LucideIcon>` — season → icon
  - `weatherIcon(weather: Weather, season: Season): LucideIcon` — weather + single-season context →
    icon (used by toolbar and world-state selector for "current weather")
  - `restrictionWeatherIcon(weather: Weather, seasons: Season[]): LucideIcon` — weather +
    multi-season context → icon (used by restriction badges, where inclement only shows snow when
    winter is the _sole_ restricted season)
  - `CATEGORY_ICON: Record<CategoryKey | "all" | "complete", LucideIcon>` — category/meta keys →
    icon. Note: `CategoryKey` is imported here, not defined here; no circular dependency.
  - `COMPLETION_ICON: Record<QuestState, LucideIcon>` — quest/completion state → icon
  - `RESTRICTION_ICON: { clock: LucideIcon; lock: LucideIcon }` — restriction badge icons
  - `PROGRESS_MARK_ICON: Record<ProgressMarkType, LucideIcon>` — meter/level shape → icon
  - `UI_ICON: Record<UIIconType, LucideIcon>` — generic UI affordance → icon
  - Re-export of `type LucideProps` and `type LucideIcon` from `@lucide/svelte`
  - `Icon` namespace object (from `index.ts`):
    `{ Category, Completion, ProgressMark, Restriction, Season, Source, UI, Weather }`

**Weather icon semantics — important behavioral note:**

There are three weather-icon functions in the codebase today, with a real divergence:

| Function                    | Location                      | `heavy_inclement` + winter |
| --------------------------- | ----------------------------- | -------------------------- |
| `weatherIcon`               | `toolbar-footer.svelte`       | `CloudDrizzle`             |
| `weatherIcon`               | `world-state-selector.svelte` | `CloudLightning`           |
| `weatherIconForRestriction` | `restriction-badges.svelte`   | `CloudLightning`           |

The toolbar-footer uses `CloudDrizzle` for winter heavy-inclement while the other two use
`CloudLightning`. The world-state-selector and toolbar-footer represent the same concept (current
weather display), so they should agree. The centralized `weatherIcon` should normalize to
`CloudLightning` for all `heavy_inclement` cases (matching the majority behavior), making
`CloudDrizzle` unused. The toolbar was likely the odd one out.

The restriction variant is genuinely different: it takes `seasons: Season[]` (plural) because
restriction badges need to distinguish "winter-only" inclement (snow) from "multi-season" inclement
(rain). This stays as a separate function.

- [ ] **Step 1: Create `icon-maps.ts`**

```ts
// src/lib/components/icon/icon-maps.ts
import {
  Archive,
  BookCheck,
  BookOpenText,
  ChevronRight,
  Circle,
  CircleCheck,
  CircleCheckBig,
  CircleDashed,
  Clock,
  CloudLightning,
  CloudRain,
  CloudSnow,
  Coins,
  CookingPot,
  Crown,
  FishingRod,
  Flame,
  Flower,
  HardHat,
  Heart,
  Landmark,
  Layers,
  Leaf,
  Lock,
  Mail,
  Octagon,
  PartyPopper,
  PawPrint,
  Pickaxe,
  Scroll,
  ScrollText,
  Shirt,
  ShoppingCart,
  Snowflake,
  Sparkles,
  Star,
  Sun,
  SunDim,
  Trophy,
  Wind,
  X,
} from "@lucide/svelte";

export type { LucideIcon, LucideProps } from "@lucide/svelte";

import type { LucideIcon } from "@lucide/svelte";

import type { CategoryKey } from "$lib/data/categories.js";
import type { SourceFilter } from "$lib/stores/toolbar-state.svelte.js";
import type { QuestState } from "$lib/stores/user-state.svelte.js";
import type { RecipeSource, Season, Weather } from "$lib/types/tracker-data.js";

// ── Source ──────────────────────────────────────────────────────────────────

export const SOURCE_ICON: Record<RecipeSource["type"], LucideIcon> = {
  beach_cave_chest: Archive,
  chicken_statue: Coins,
  default: CircleCheck,
  dragon_forge: Flame,
  festival: PartyPopper,
  letter: Mail,
  mines_chest: Pickaxe,
  mines_dig_site: Pickaxe,
  museum_donation: Landmark,
  perk: Sparkles,
  quest: Scroll,
  relationship: Heart,
  renown: Crown,
  scroll_bundle: ShoppingCart,
  store: ShoppingCart,
  store_with_perk: ShoppingCart,
  treasure_chest: FishingRod,
  upgrade: HardHat,
  wishing_well: Coins,
};

export const SOURCE_FILTERS: SourceFilter[] = [
  { icon: Archive, label: "Chest", types: ["beach_cave_chest"] },
  { icon: HardHat, label: "Construction", types: ["upgrade"] },
  { icon: CircleCheck, label: "Default", types: ["default"] },
  { icon: Flame, label: "Dragon Forge", types: ["dragon_forge"] },
  { icon: PartyPopper, label: "Festival", types: ["festival"] },
  { icon: FishingRod, label: "Fishing", types: ["treasure_chest"] },
  { icon: Mail, label: "Letter", types: ["letter"] },
  { icon: Pickaxe, label: "Mines", types: ["mines_chest", "mines_dig_site"] },
  { icon: Landmark, label: "Museum", types: ["museum_donation"] },
  { icon: Coins, label: "Offering", types: ["chicken_statue", "wishing_well"] },
  { icon: Sparkles, label: "Perk", types: ["perk"] },
  { icon: Scroll, label: "Quest", types: ["quest"] },
  { icon: Heart, label: "Relationship", types: ["relationship"] },
  { icon: ShoppingCart, label: "Store", types: ["store", "store_with_perk", "scroll_bundle"] },
  { icon: Crown, label: "Town rank", types: ["renown"] },
];

// ── Season ──────────────────────────────────────────────────────────────────

export const SEASON_ICON: Record<Season, LucideIcon> = {
  fall: Leaf,
  spring: Flower,
  summer: Sun,
  winter: Snowflake,
};

// ── Weather ─────────────────────────────────────────────────────────────────

export function weatherIcon(weather: Weather, season: Season): LucideIcon {
  if (weather === "calm") return SunDim;
  if (weather === "special") return Wind;
  if (weather === "heavy_inclement") return CloudLightning;
  if (season === "winter") return CloudSnow;
  return CloudRain;
}

export function restrictionWeatherIcon(weather: Weather, seasons: Season[]): LucideIcon {
  if (weather === "calm") return SunDim;
  if (weather === "special") return Wind;
  if (weather === "heavy_inclement") return CloudLightning;
  if (seasons.length === 1 && seasons[0] === "winter") return CloudSnow;
  return CloudRain;
}

// ── Category ────────────────────────────────────────────────────────────────

export const CATEGORY_ICON: Record<CategoryKey | "all" | "complete", LucideIcon> = {
  all: Layers,
  almanac: BookCheck,
  animals: PawPrint,
  complete: Trophy,
  cosmetics: Shirt,
  mines: Pickaxe,
  museum: Landmark,
  npcs: Heart,
  quests: ScrollText,
  recipes: CookingPot,
  renown: Crown,
  skills: BookOpenText,
};

// ── Completion ──────────────────────────────────────────────────────────────

export const COMPLETION_ICON: Record<QuestState, LucideIcon> = {
  completed: CircleCheckBig,
  none: CircleDashed,
  obtained: Circle,
};

// ── Restriction ─────────────────────────────────────────────────────────────

export const RESTRICTION_ICON = {
  clock: Clock,
  lock: Lock,
} as const satisfies Record<string, LucideIcon>;

// ── ProgressMark ────────────────────────────────────────────────────────────

export type ProgressMarkType = "relationship_dateable" | "relationship_platonic" | "town_rank";

export const PROGRESS_MARK_ICON: Record<ProgressMarkType, LucideIcon> = {
  relationship_dateable: Heart,
  relationship_platonic: Octagon,
  town_rank: Star,
};

// ── UI ──────────────────────────────────────────────────────────────────────

export type UIIconType = "disclosure" | "dismiss";

export const UI_ICON: Record<UIIconType, LucideIcon> = {
  disclosure: ChevronRight,
  dismiss: X,
};
```

- [ ] **Step 2: Create variant components**

Each variant is a thin Svelte component. Create these files:

**`src/lib/components/icon/icon-source.svelte`**

```svelte
<script lang="ts">
  import { SOURCE_ICON } from "$lib/components/icon/icon-maps.js";

  import type { LucideProps } from "$lib/components/icon/icon-maps.js";
  import type { RecipeSource } from "$lib/types/tracker-data.js";

  interface Props extends LucideProps {
    type: RecipeSource["type"];
  }

  let { type, ...rest }: Props = $props();

  const IconComp = $derived(SOURCE_ICON[type]);
</script>

<IconComp {...rest} />
```

**`src/lib/components/icon/icon-season.svelte`**

```svelte
<script lang="ts">
  import { SEASON_ICON } from "$lib/components/icon/icon-maps.js";

  import type { LucideProps } from "$lib/components/icon/icon-maps.js";
  import type { Season } from "$lib/types/tracker-data.js";

  interface Props extends LucideProps {
    season: Season;
  }

  let { season, ...rest }: Props = $props();

  const IconComp = $derived(SEASON_ICON[season]);
</script>

<IconComp {...rest} />
```

**`src/lib/components/icon/icon-weather.svelte`**

```svelte
<script lang="ts">
  import { weatherIcon } from "$lib/components/icon/icon-maps.js";

  import type { LucideProps } from "$lib/components/icon/icon-maps.js";
  import type { Season, Weather } from "$lib/types/tracker-data.js";

  interface Props extends LucideProps {
    season: Season;
    weather: Weather;
  }

  let { season, weather, ...rest }: Props = $props();

  const IconComp = $derived(weatherIcon(weather, season));
</script>

<IconComp {...rest} />
```

**`src/lib/components/icon/icon-category.svelte`**

```svelte
<script lang="ts">
  import { CATEGORY_ICON } from "$lib/components/icon/icon-maps.js";

  import type { LucideProps } from "$lib/components/icon/icon-maps.js";
  import type { CategoryKey } from "$lib/data/categories.js";

  interface Props extends LucideProps {
    category: CategoryKey | "all" | "complete";
  }

  let { category, ...rest }: Props = $props();

  const IconComp = $derived(CATEGORY_ICON[category]);
</script>

<IconComp {...rest} />
```

**`src/lib/components/icon/icon-completion.svelte`**

```svelte
<script lang="ts">
  import { COMPLETION_ICON } from "$lib/components/icon/icon-maps.js";

  import type { LucideProps } from "$lib/components/icon/icon-maps.js";
  import type { QuestState } from "$lib/stores/user-state.svelte.js";

  interface Props extends LucideProps {
    state: QuestState;
  }

  let { state, ...rest }: Props = $props();

  const IconComp = $derived(COMPLETION_ICON[state]);
</script>

<IconComp {...rest} />
```

**`src/lib/components/icon/icon-restriction.svelte`**

```svelte
<script lang="ts">
  import { RESTRICTION_ICON } from "$lib/components/icon/icon-maps.js";

  import type { LucideProps } from "$lib/components/icon/icon-maps.js";

  interface Props extends LucideProps {
    type: keyof typeof RESTRICTION_ICON;
  }

  let { type, ...rest }: Props = $props();

  const IconComp = $derived(RESTRICTION_ICON[type]);
</script>

<IconComp {...rest} />
```

**`src/lib/components/icon/icon-progress-mark.svelte`**

```svelte
<script lang="ts">
  import { PROGRESS_MARK_ICON } from "$lib/components/icon/icon-maps.js";

  import type { LucideProps } from "$lib/components/icon/icon-maps.js";
  import type { ProgressMarkType } from "$lib/components/icon/icon-maps.js";

  interface Props extends LucideProps {
    type: ProgressMarkType;
  }

  let { type, ...rest }: Props = $props();

  const IconComp = $derived(PROGRESS_MARK_ICON[type]);
</script>

<IconComp {...rest} />
```

**`src/lib/components/icon/icon-ui.svelte`**

```svelte
<script lang="ts">
  import { UI_ICON } from "$lib/components/icon/icon-maps.js";

  import type { LucideProps } from "$lib/components/icon/icon-maps.js";
  import type { UIIconType } from "$lib/components/icon/icon-maps.js";

  interface Props extends LucideProps {
    type: UIIconType;
  }

  let { type, ...rest }: Props = $props();

  const IconComp = $derived(UI_ICON[type]);
</script>

<IconComp {...rest} />
```

- [ ] **Step 3: Create the barrel `index.ts`**

```ts
// src/lib/components/icon/index.ts
import IconCategory from "$lib/components/icon/icon-category.svelte";
import IconCompletion from "$lib/components/icon/icon-completion.svelte";
import IconProgressMark from "$lib/components/icon/icon-progress-mark.svelte";
import IconRestriction from "$lib/components/icon/icon-restriction.svelte";
import IconSeason from "$lib/components/icon/icon-season.svelte";
import IconSource from "$lib/components/icon/icon-source.svelte";
import IconUI from "$lib/components/icon/icon-ui.svelte";
import IconWeather from "$lib/components/icon/icon-weather.svelte";

export type { LucideIcon, LucideProps } from "$lib/components/icon/icon-maps.js";
export { SOURCE_FILTERS } from "$lib/components/icon/icon-maps.js";

export const Icon = {
  Category: IconCategory,
  Completion: IconCompletion,
  ProgressMark: IconProgressMark,
  Restriction: IconRestriction,
  Season: IconSeason,
  Source: IconSource,
  UI: IconUI,
  Weather: IconWeather,
};
```

- [ ] **Step 4: Run `pnpm run check` and `pnpm run lint:fix`**

Verify the new files compile and pass lint. Fix any import ordering issues the auto-fixer catches.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/icon/
git commit -m "feat: add centralized Icon namespace with semantic variants"
```

---

### Task 2: Migrate `categories.ts` & its consumers to `Icon.Category`

Decouple `categories.ts` from direct Lucide imports. Also migrate the three components that render
`category.icon` directly — they currently declare `const Icon = $derived(category.icon)` which
collides with the `Icon` namespace import. These components should use `<Icon.Category>` instead.

**Important — avoiding circular types:** `CategoryKey` is inferred from `CATEGORIES_INTERNAL` in
`categories.ts`. `CATEGORY_ICON` in `icon-maps.ts` imports `CategoryKey`. If `CATEGORIES_INTERNAL`
also imports from `icon-maps.ts`, this creates a circular dependency. Solution: define `CategoryKey`
independently as a string union in `categories.ts`, then both files can use it without circularity.

**Files:**

- Modify: `src/lib/data/categories.ts` — define `CategoryKey` as explicit union, remove Lucide
  imports, source icons from `CATEGORY_ICON`
- Modify: `src/lib/components/category-card.svelte` — replace `Trophy` and
  `const Icon = $derived(category.icon)` with `Icon.Category`
- Modify: `src/lib/components/category-header.svelte` — replace
  `const Icon = $derived(category.icon)` with `Icon.Category`
- Modify: `src/routes/all/SectionHeader.svelte` — replace `const Icon = $derived(category.icon)`
  with `Icon.Category`

**Interfaces:**

- Consumes: `CATEGORY_ICON` from `icon-maps.ts`
- Produces: `CategoryKey` as explicit union type (no longer inferred from array), `CategoryMeta`
  with `icon: LucideIcon` sourced from centralized map

- [ ] **Step 1: Update `categories.ts`**

Define `CategoryKey` as an explicit string union to break the circular dependency:

```ts
// src/lib/data/categories.ts
import { CATEGORY_ICON } from "$lib/components/icon/icon-maps.js";

import type { LucideIcon } from "$lib/components/icon/icon-maps.js";

export type CategoryKey =
  | "almanac"
  | "animals"
  | "cosmetics"
  | "mines"
  | "museum"
  | "npcs"
  | "quests"
  | "recipes"
  | "renown"
  | "skills";

const CATEGORIES_INTERNAL: readonly {
  icon: LucideIcon;
  key: CategoryKey;
  name: string;
}[] = [
  { icon: CATEGORY_ICON.museum, key: "museum", name: "Museum" },
  { icon: CATEGORY_ICON.almanac, key: "almanac", name: "Almanac" },
  { icon: CATEGORY_ICON.recipes, key: "recipes", name: "Recipes" },
  { icon: CATEGORY_ICON.animals, key: "animals", name: "Animals" },
  { icon: CATEGORY_ICON.npcs, key: "npcs", name: "NPCs" },
  { icon: CATEGORY_ICON.cosmetics, key: "cosmetics", name: "Cosmetics" },
  { icon: CATEGORY_ICON.skills, key: "skills", name: "Skills" },
  { icon: CATEGORY_ICON.renown, key: "renown", name: "Renown" },
  { icon: CATEGORY_ICON.quests, key: "quests", name: "Quests" },
  { icon: CATEGORY_ICON.mines, key: "mines", name: "Mines" },
];
```

Remove the 10 Lucide icon imports and `import type { Component } from "svelte"`. Update the
`CategoryMeta` interface to use `LucideIcon` instead of `Component<{ class?: string }>`. Keep
`categoryColor`, `categoryHref`, `CATEGORIES`, and `CATEGORY_BY_KEY` exports unchanged.

- [ ] **Step 2: Update `category-card.svelte`**

Replace:

```svelte
import {Trophy} from "@lucide/svelte";
```

With:

```svelte
import {Icon} from "$lib/components/icon/index.js";
```

Remove `const Icon = $derived(category.icon);` — this name collides with the `Icon` namespace.

Replace template usages:

```svelte
<!-- Before -->
{#if isComplete}
  <Trophy class="size-4 shrink-0 text-yellow-700 dark:text-yellow-400" />
{:else}
  <Icon class="size-4 shrink-0 text-(--category-color)" />
{/if}
<!-- After -->
{#if isComplete}
  <Icon.Category category="complete" class="size-4 shrink-0 text-yellow-700 dark:text-yellow-400" />
{:else}
  <Icon.Category category={category.key} class="size-4 shrink-0 text-(--category-color)" />
{/if}
```

- [ ] **Step 3: Update `category-header.svelte`**

Remove `const Icon = $derived(category.icon);`.

Replace template usage:

```svelte
<!-- Before -->
<Icon class={color ? "size-5 text-(--header-color)" : "size-5 text-muted-foreground"} />
<!-- After -->
<Icon.Category
  category={category.key}
  class={color ? "size-5 text-(--header-color)" : "size-5 text-muted-foreground"}
/>
```

Add import:

```svelte
import {Icon} from "$lib/components/icon/index.js";
```

Keep `ArrowLeft` as direct Lucide import (pending #59).

- [ ] **Step 4: Update `src/routes/all/SectionHeader.svelte`**

Remove `const Icon = $derived(category.icon);`.

Replace template usage:

```svelte
<!-- Before -->
<Icon class="size-4 text-(--header-color)" />
<!-- After -->
<Icon.Category category={category.key} class="size-4 text-(--header-color)" />
```

Add import:

```svelte
import {Icon} from "$lib/components/icon/index.js";
```

- [ ] **Step 5: Run `pnpm run check` and `pnpm run lint:fix`**

- [ ] **Step 6: Commit**

```bash
git add src/lib/data/categories.ts src/lib/components/category-card.svelte src/lib/components/category-header.svelte src/routes/all/SectionHeader.svelte
git commit -m "refactor: migrate categories & their renderers to Icon.Category"
```

---

### Task 3: Migrate remaining category display components

Replace `Trophy` and `Layers` imports in components that display category-level meta icons.

**Files:**

- Modify: `src/lib/components/category-grid.svelte` — replace `Trophy` with `Icon.Category`
- Modify: `src/routes/+page.svelte` — replace `Layers`, `ChevronRight` with `Icon.Category`,
  `Icon.UI`
- Modify: `src/routes/all/+page.svelte` — replace `Layers` with `Icon.Category`

**Interfaces:**

- Consumes: `Icon.Category` (with `category="complete"` for Trophy, `category="all"` for Layers),
  `Icon.UI` (with `type="disclosure"`)

- [ ] **Step 1: Update `category-grid.svelte`**

Replace `Trophy` import with `Icon`. Replace `<Trophy ...>` with
`<Icon.Category category="complete" ...>`.

- [ ] **Step 2: Update `src/routes/+page.svelte`**

Replace:

```svelte
import {(ChevronRight, Layers, Settings, Wheat)} from "@lucide/svelte";
```

With:

```svelte
import {(Settings, Wheat)} from "@lucide/svelte"; import {Icon} from "$lib/components/icon/index.js";
```

Replace template usages:

- `<Layers ...>` → `<Icon.Category category="all" ...>`
- `<ChevronRight ...>` → `<Icon.UI type="disclosure" ...>`

`Settings` and `Wheat` remain as direct Lucide imports (single-use, app-identity icons).

- [ ] **Step 3: Update `src/routes/all/+page.svelte`**

Replace:

```svelte
import {(ArrowLeft, Layers)} from "@lucide/svelte";
```

With:

```svelte
import {ArrowLeft} from "@lucide/svelte"; import {Icon} from "$lib/components/icon/index.js";
```

Replace `<Layers ...>` → `<Icon.Category category="all" ...>`. Keep `ArrowLeft` (pending #59).

- [ ] **Step 4: Run `pnpm run check` and `pnpm run lint:fix`**

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/category-grid.svelte src/routes/+page.svelte src/routes/all/+page.svelte
git commit -m "refactor: migrate category grid & page icons to Icon.Category"
```

---

### Task 4: Migrate season & weather icons

The `SEASON_ICON` record is duplicated in six files and the `weatherIcon` function in two (plus a
`weatherIconForRestriction` variant in restriction-badges). Replace all with `Icon.Season`,
`Icon.Weather`, and centralized map imports.

**Files:**

- Modify: `src/lib/components/toolbar-footer.svelte`
- Modify: `src/lib/components/world-state-selector.svelte`
- Modify: `src/lib/components/animals-content.svelte`
- Modify: `src/routes/(category)/npcs/+page.svelte`
- Modify: `src/routes/all/NpcsSection.svelte`

**Interfaces:**

- Consumes: `Icon.Season` (prop: `season: Season`), `Icon.Weather` (props: `weather: Weather`,
  `season: Season`), `SEASON_ICON` and `weatherIcon` from `icon-maps.ts` (for iteration-based
  lookups where templates need the raw component reference)

Note: restriction-badges is handled in Task 5 since it also needs `Icon.Restriction` and the
separate `restrictionWeatherIcon` function.

**Important note on season icon styling:** Several call sites apply custom styling to season icons:

- Fall (`Leaf`) gets `class="-scale-y-100 rotate-90"` to flip the leaf icon
- Summer (`Sun`) gets `strokeWidth={2.5}` for visual weight

These per-season style overrides pass through `LucideProps` on `Icon.Season`, so call sites keep
their existing class/strokeWidth props.

- [ ] **Step 1: Update `toolbar-footer.svelte`**

Remove all season and weather Lucide imports (`Flower`, `Leaf`, `Sun`, `Snowflake`, `SunDim`,
`Wind`, `CloudDrizzle`, `CloudLightning`, `CloudRain`, `CloudSnow`). Remove the inline `SEASON_ICON`
record and `weatherIcon` function.

Import:

```svelte
import {Icon} from "$lib/components/icon/index.js"; import {(SEASON_ICON, weatherIcon)} from "$lib/components/icon/icon-maps.js";
```

The `SEASON_ICON` and `weatherIcon` direct imports are needed because this component iterates over
seasons to build `$derived` values (`CurrentSeasonIcon`, `CurrentWeatherIcon`) and `WeatherTile`
objects that hold raw component references. These patterns use the map/function directly.

For template usages where an icon renders directly from a season value, replace:

```svelte
<!-- Before -->
{@const Icon = SEASON_ICON[s]}
<Icon class="size-5 ..." strokeWidth={...} />
<!-- After -->
<Icon.Season season={s} class="size-5 ..." strokeWidth={...} />
```

Note: the local `{@const Icon = SEASON_ICON[s]}` binding shadows the imported `Icon` namespace, so
converting these to `<Icon.Season>` also eliminates the shadowing.

Also replace `X` → `<Icon.UI type="dismiss" ...>`.

Keep `ChevronDown`, `ChevronUp`, `Search`, and `ListFilter` as direct Lucide imports — they're
single-file, toolbar-specific.

- [ ] **Step 2: Update `world-state-selector.svelte`**

Remove all season/weather Lucide imports. Remove inline `SEASON_ICON` record and `weatherIcon`
function.

```svelte
import {Icon} from "$lib/components/icon/index.js"; import {(SEASON_ICON, weatherIcon)} from "$lib/components/icon/icon-maps.js";
```

Same pattern as toolbar-footer: the `CurrentSeasonIcon`/`CurrentWeatherIcon` derivations use the raw
map/function, while direct template renders use `<Icon.Season>`.

Note: this normalizes `heavy_inclement` + winter from `CloudLightning` (unchanged for
world-state-selector) while fixing toolbar-footer's divergent `CloudDrizzle` to match.

- [ ] **Step 3: Update `animals-content.svelte`**

Remove `Flower`, `Leaf`, `Snowflake`, `Sun` imports and the inline `SEASON_ICON` record.

```svelte
import {Icon} from "$lib/components/icon/index.js";
```

Replace:

```svelte
<!-- Before -->
{@const SeasonIcon = SEASON_ICON[variant.bornIn]}
<SeasonIcon class="..." />
<!-- After -->
<Icon.Season season={variant.bornIn} class="..." />
```

Remove `import type { Component } from "svelte"` if no longer needed.

- [ ] **Step 4: Update `src/routes/(category)/npcs/+page.svelte`**

Remove `Flower`, `Leaf`, `Sun`, `Snowflake` imports and inline `SEASON_ICON` record.

```svelte
import {Icon} from "$lib/components/icon/index.js";
```

Replace birthday icon:

```svelte
<!-- Before -->
{@const BdayIcon = SEASON_ICON[npc.birthday.season]}
<BdayIcon class="size-3 ..." strokeWidth={...} />
<!-- After -->
<Icon.Season
  season={npc.birthday.season}
  class="size-3 {npc.birthday.season === 'fall' ? '-scale-y-100 rotate-90' : ''}"
  strokeWidth={npc.birthday.season === "summer" ? 2.5 : undefined}
/>
```

Keep `Heart` and `Octagon` imports for now — they're migrated in Task 6.

- [ ] **Step 5: Update `src/routes/all/NpcsSection.svelte`**

Same as npcs page: remove season Lucide imports and inline `SEASON_ICON`, replace with
`Icon.Season`.

Keep `Heart` and `Octagon` for Task 6.

- [ ] **Step 6: Run `pnpm run check` and `pnpm run lint:fix`**

- [ ] **Step 7: Commit**

```bash
git add src/lib/components/toolbar-footer.svelte src/lib/components/world-state-selector.svelte src/lib/components/animals-content.svelte src/routes/\(category\)/npcs/+page.svelte src/routes/all/NpcsSection.svelte
git commit -m "refactor: migrate season & weather icons to Icon.Season and Icon.Weather"
```

---

### Task 5: Migrate recipes, completion, & restriction icons

**Files:**

- Modify: `src/lib/components/recipes-content.svelte` — replace `ChevronRight` and `SourceIcon` with
  `Icon.UI` and `Icon.Source`
- Modify: `src/lib/components/quests-content.svelte` — replace quest state icons with
  `Icon.Completion`
- Modify: `src/lib/components/restriction-badges.svelte` — replace season/weather/clock/lock icons
- Modify: `src/lib/components/icon/icon-maps.ts` — add `restrictionWeatherIcon` (if not already
  present from Task 1)
- Remove: `src/lib/components/source-icon.svelte` — superseded by `Icon.Source`
- Remove: `src/lib/components/source-icons.ts` — superseded by `icon-maps.ts`

**Interfaces:**

- Consumes: `Icon.Source`, `Icon.UI`, `Icon.Completion`, `Icon.Season`, `Icon.Restriction`,
  `restrictionWeatherIcon` from `icon-maps.ts`

- [ ] **Step 1: Update `recipes-content.svelte`**

Replace:

```svelte
import {ChevronRight} from "@lucide/svelte"; import SourceIcon from "$lib/components/source-icon.svelte";
import {SOURCE_FILTERS} from "$lib/components/source-icons.js";
```

With:

```svelte
import {(Icon, SOURCE_FILTERS)} from "$lib/components/icon/index.js";
```

Replace template usages:

- `<SourceIcon type={sourceType} ...>` → `<Icon.Source type={sourceType} ...>`
- `<SourceIcon type={source.type} ...>` → `<Icon.Source type={source.type} ...>`
- `<ChevronRight ...>` → `<Icon.UI type="disclosure" ...>`

- [ ] **Step 2: Update `quests-content.svelte`**

Replace:

```svelte
import {(Circle, CircleCheckBig, CircleDashed)} from "@lucide/svelte";
```

With:

```svelte
import {Icon} from "$lib/components/icon/index.js";
```

Replace the three-way conditional:

```svelte
<!-- Before -->
{#if questState === "none"}
  <CircleDashed class="size-5 text-muted-foreground/50" />
{:else if questState === "obtained"}
  <Circle class="size-5 text-amber-500 dark:text-amber-400" />
{:else}
  <CircleCheckBig class="size-5 text-green-600 dark:text-green-400" />
{/if}
<!-- After -->
<Icon.Completion
  state={questState}
  class="size-5 {questState === 'none'
    ? 'text-muted-foreground/50'
    : questState === 'obtained'
      ? 'text-amber-500 dark:text-amber-400'
      : 'text-green-600 dark:text-green-400'}"
/>
```

- [ ] **Step 3: Update `restriction-badges.svelte`**

Replace all Lucide imports with:

```svelte
import {Icon} from "$lib/components/icon/index.js"; import {restrictionWeatherIcon} from "$lib/components/icon/icon-maps.js";
```

Remove the inline `SEASON_ICON` record and `weatherIconForRestriction` function. The centralized
`restrictionWeatherIcon` in `icon-maps.ts` has identical logic (takes `seasons: Season[]`, only
shows snow for winter-only inclement).

Replace template usages:

- Season icons: `{@const Icon = SEASON_ICON[s]}` + `<Icon ...>` → `<Icon.Season season={s} ...>`
- Weather icons: `{@const Icon = weatherIconForRestriction(w, ...)}` + `<Icon ...>` → use
  `{@const WeatherComp = restrictionWeatherIcon(w, getSeasonContext())}` then `<WeatherComp ...>`
  (raw component reference needed since icon varies by runtime args)
- `<Clock ...>` → `<Icon.Restriction type="clock" ...>`
- `<Lock ...>` → `<Icon.Restriction type="lock" ...>`

Note: the `{@const Icon = SEASON_ICON[s]}` pattern inside `{#each}` blocks shadows the `Icon`
import. When replacing these with `<Icon.Season>`, the `{@const}` line is removed entirely,
eliminating the shadowing.

- [ ] **Step 4: Remove old source icon files**

```bash
rm src/lib/components/source-icon.svelte src/lib/components/source-icons.ts
```

- [ ] **Step 5: Run `pnpm run check` and `pnpm run lint:fix`**

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/icon/icon-maps.ts src/lib/components/recipes-content.svelte src/lib/components/quests-content.svelte src/lib/components/restriction-badges.svelte
git add -A src/lib/components/source-icon.svelte src/lib/components/source-icons.ts
git commit -m "refactor: migrate source, completion, & restriction icons to Icon namespace"
```

---

### Task 6: Migrate ProgressMark & remaining UI icons

**Files:**

- Modify: `src/routes/(category)/npcs/+page.svelte` — replace `Heart`/`Octagon` with
  `Icon.ProgressMark`
- Modify: `src/routes/all/NpcsSection.svelte` — replace `Heart`/`Octagon` with `Icon.ProgressMark`
- Modify: `src/routes/(category)/renown/+page.svelte` — replace `Star` with `Icon.ProgressMark`
- Modify: `src/routes/(category)/renown/RankCard.svelte` — replace `Star` with `Icon.ProgressMark`
- Modify: `src/routes/all/RenownSection.svelte` — replace `Star` with `Icon.ProgressMark`
- Modify: `src/lib/components/expandable-section.svelte` — replace `ChevronRight` with `Icon.UI`
- Modify: `src/lib/components/item-row.svelte` — replace `ChevronRight` with `Icon.UI`
- Modify: `src/lib/components/cosmetic-row.svelte` — replace `ChevronRight` with `Icon.UI`

**Interfaces:**

- Consumes: `Icon.ProgressMark` (with
  `type: "relationship_dateable" | "relationship_platonic" | "town_rank"`), `Icon.UI` (with
  `type: "disclosure"`)

- [ ] **Step 1: Update `npcs/+page.svelte`**

Remove `Heart` and `Octagon` imports (the `Icon` import should already be present from Task 4):

```svelte
<!-- Before -->
{#if npc.dateable}
  <Heart
    class="size-4 transition-colors duration-200 {i < level
      ? `${LEVEL_COLORS[i]} fill-current`
      : 'fill-transparent text-muted-foreground/30'}"
  />
{:else}
  <Octagon
    class="size-4 transition-colors duration-200 {i < level
      ? `${LEVEL_COLORS[i]} fill-current`
      : 'fill-transparent text-muted-foreground/30'}"
  />
{/if}
<!-- After -->
<Icon.ProgressMark
  type={npc.dateable ? "relationship_dateable" : "relationship_platonic"}
  class="size-4 transition-colors duration-200 {i < level
    ? `${LEVEL_COLORS[i]} fill-current`
    : 'fill-transparent text-muted-foreground/30'}"
/>
```

After this step, no direct Lucide imports should remain in this file.

- [ ] **Step 2: Update `all/NpcsSection.svelte`**

Remove `Heart` and `Octagon` imports.

Replace:

```svelte
{@const StatusIcon = npc.dateable ? Heart : Octagon}
<StatusIcon class="size-4 transition-colors duration-200 ..." />
```

With:

```svelte
<Icon.ProgressMark
  type={npc.dateable ? "relationship_dateable" : "relationship_platonic"}
  class="size-4 transition-colors duration-200 ..."
/>
```

- [ ] **Step 3: Update `renown/+page.svelte`**

Replace `Star` import with `Icon` (add to existing import if present). Replace all `<Star ...>` with
`<Icon.ProgressMark type="town_rank" ...>`, preserving `fill`, `style`, and `strokeWidth` props:

```svelte
<!-- Hero star -->
<Icon.ProgressMark
  type="town_rank"
  class="size-9"
  style="color: {currentRankColor}"
  fill={currentRankColor}
  strokeWidth={1.5}
/>
```

- [ ] **Step 4: Update `renown/RankCard.svelte`**

Replace `Star` import with:

```svelte
import {Icon} from "$lib/components/icon/index.js";
```

Replace all three `<Star ...>` usages with `<Icon.ProgressMark type="town_rank" ...>`, preserving
the `fill`, `style`, `strokeWidth`, and `aria-label` props.

- [ ] **Step 5: Update `all/RenownSection.svelte`**

Replace `Star` import with `Icon`. Check how `Star` is used in this file and replace with
`<Icon.ProgressMark type="town_rank" ...>`.

- [ ] **Step 6: Update disclosure icon components**

In each of these files, replace `import { ChevronRight } from "@lucide/svelte"` with
`import { Icon } from "$lib/components/icon/index.js"`, and replace `<ChevronRight ...>` with
`<Icon.UI type="disclosure" ...>`:

- `src/lib/components/expandable-section.svelte`
- `src/lib/components/item-row.svelte`
- `src/lib/components/cosmetic-row.svelte`

- [ ] **Step 7: Run `pnpm run check` and `pnpm run lint:fix`**

- [ ] **Step 8: Commit**

```bash
git add src/routes/\(category\)/npcs/+page.svelte src/routes/all/NpcsSection.svelte src/routes/\(category\)/renown/+page.svelte src/routes/\(category\)/renown/RankCard.svelte src/routes/all/RenownSection.svelte src/lib/components/expandable-section.svelte src/lib/components/item-row.svelte src/lib/components/cosmetic-row.svelte
git commit -m "refactor: migrate progress marks & disclosure icons to Icon namespace"
```

---

### Task 7: Migrate remaining dismiss (`X`) icons & final audit

Migrate the remaining `X` usages and do a final sweep to confirm no shared/duplicated Lucide imports
remain outside `icon-maps.ts`.

**Files:**

- Modify: `src/lib/components/toolbar-footer.svelte` — replace `X` with `Icon.UI` (if not done in
  Task 4)
- Modify: `src/routes/settings/transfer-card.svelte` — replace `X` with `Icon.UI`
- Audit: all `src/` files except `src/lib/components/ui/`

**Interfaces:**

- Consumes: `Icon.UI` (with `type: "dismiss"`)

- [ ] **Step 1: Replace remaining `X` imports**

In `toolbar-footer.svelte`, if `X` wasn't already replaced in Task 4, replace its template usages:
`<X class="..." />` → `<Icon.UI type="dismiss" class="..." />`

In `transfer-card.svelte`, replace `X` with `Icon.UI type="dismiss"` for consistency. Add
`import { Icon } from "$lib/components/icon/index.js"`. Keep `Camera`, `ImagePlus`, `Smartphone`,
`QrCode`, `LoaderCircle` as direct imports (transfer-specific, single-file).

- [ ] **Step 2: Run the audit**

```bash
grep -rn 'from "@lucide/svelte"' --include="*.svelte" --include="*.ts" src/ | grep -v "src/lib/components/ui/" | grep -v "src/lib/components/icon/icon-maps.ts"
```

This should return only intentionally-kept single-use direct imports:

- `src/routes/+page.svelte` — `Settings`, `Wheat` (app identity)
- `src/routes/settings/backup-card.svelte` — `FileUp`, `Upload`
- `src/routes/settings/danger-zone-card.svelte` — `RotateCcw`, `Trash2`
- `src/routes/settings/import-card.svelte` — `Check`, `Copy`, `Monitor`, `Upload`
- `src/routes/settings/spoilers-card.svelte` — `Eye`, `EyeOff`
- `src/routes/settings/transfer-card.svelte` — `Camera`, `ImagePlus`, `Smartphone`, `QrCode`,
  `LoaderCircle`
- `src/routes/privacy/+page.svelte` — `ArrowLeft` (pending #59)
- `src/routes/settings/+page.svelte` — `ArrowLeft` (pending #59)
- `src/routes/all/+page.svelte` — `ArrowLeft` (pending #59)
- `src/lib/components/category-header.svelte` — `ArrowLeft` (pending #59)
- `src/lib/components/stepper.svelte` — `Plus`, `Minus`
- `src/lib/components/search-bar.svelte` — dead code (pending #61)
- `src/lib/components/toolbar-footer.svelte` — `Search`, `ListFilter`, `ChevronUp`, `ChevronDown`
- `src/lib/components/welcome-card.svelte` — `FileDown`, `Pencil`, `QrCode`

Verify none of these icons appear in multiple files (duplicates that should have been centralized).
Known multi-file exceptions that are intentionally kept:

- `ArrowLeft` — 4 files, all pending header harmonization #59
- `Upload` — 2 files (backup-card, import-card), both settings-only
- `QrCode` — 2 files (welcome-card, transfer-card), both settings/onboarding-specific
- `LoaderCircle` — search-bar (dead code #61) + transfer-card

- [ ] **Step 3: Run full test suite**

```bash
pnpm run check && pnpm run lint && pnpm exec vitest run
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: migrate dismiss icons & audit remaining Lucide imports"
```

---

### Task 8: Update PR #57

This work continues on branch `51-source-icon-component` and reuses the existing PR #57.

**Files:**

- No code changes

- [ ] **Step 1: Push and update PR #57**

```bash
git push
```

Then update the PR title and body to reflect the expanded scope:

```bash
gh pr edit 57 --title "Centralized Icon namespace component" --body "$(cat <<'PREOF'
## Summary

- Introduces `Icon.*` namespace (`Icon.Source`, `Icon.Season`, `Icon.Weather`, `Icon.Category`, `Icon.Completion`, `Icon.Restriction`, `Icon.ProgressMark`, `Icon.UI`) that maps semantic domain types to Lucide icons
- All icon-to-Lucide mappings live in `src/lib/components/icon/icon-maps.ts`; the barrel at `src/lib/components/icon/index.ts` re-exports `LucideProps`/`LucideIcon` so consumers never need to import Lucide directly
- Eliminates duplicated `SEASON_ICON` records (was in 6 files), `weatherIcon` functions (2 files + 1 variant), and `SOURCE_ICON`/`SOURCE_FILTERS` definitions
- Normalizes `heavy_inclement` + winter weather icon to `CloudLightning` (toolbar-footer previously used `CloudDrizzle`; world-state-selector and restriction-badges used `CloudLightning`)
- Swaps `FishingHook` → `FishingRod` for `treasure_chest` sources (#53)
- Migrates `category-card`, `category-header`, and `SectionHeader` from `category.icon` raw component rendering to `<Icon.Category>`
- Remaining direct Lucide imports are single-file, single-use icons (settings actions, app identity, stepper ±) plus `ArrowLeft` pending header harmonization (#59) and dead `search-bar` pending #61

Closes #51
Closes #53

## Test plan

- [ ] Verify recipe source icons render correctly (collapsed & expanded)
- [ ] Verify source filter chips work
- [ ] Verify season/weather icons in toolbar, world-state selector, NPC birthdays, animal born-in badges, and restriction badges
- [ ] Verify category icons on home page grid, category headers, and all-page section headers
- [ ] Verify quest completion state icons cycle correctly
- [ ] Verify NPC heart/octagon progress marks render with correct colors
- [ ] Verify renown star icons render (hero, rank cards, filled/unfilled states)
- [ ] Verify disclosure chevrons animate on expand/collapse
- [ ] Verify dismiss (X) buttons work in toolbar search and transfer card
- [ ] Verify `FishingRod` icon appears for treasure chest sources (not `FishingHook`)
- [ ] `pnpm run check` passes
- [ ] `pnpm run lint` passes
- [ ] `pnpm exec vitest run` passes

🤖 Generated with [Claude Code](https://claude.com/claude-code)
PREOF
)"
```
