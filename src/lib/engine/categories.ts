import { projectAlmanac } from "#lib/engine/projections/almanac.js";
import { projectAnimals } from "#lib/engine/projections/animals.js";
import { projectCosmetics } from "#lib/engine/projections/cosmetics.js";
import { projectMines } from "#lib/engine/projections/mines.js";
import { projectMuseum } from "#lib/engine/projections/museum.js";
import { projectQuests } from "#lib/engine/projections/quests.js";
import { projectRecipes } from "#lib/engine/projections/recipes.js";
import { projectRenown } from "#lib/engine/projections/renown.js";
import { projectSkills } from "#lib/engine/projections/skills.js";
import { projectVillagers } from "#lib/engine/projections/villagers.js";
import {
  searchAlmanac,
  searchAnimals,
  searchCosmetics,
  searchMuseum,
  searchQuests,
  searchRecipes,
  searchVillagers,
} from "#lib/engine/search-providers.js";
import { addProgress } from "#lib/engine/shelves.js";
import { recordKeys, recordMap, recordValues } from "#lib/utils/record.js";

import type { CategoryProgress, ProgressContext } from "#lib/engine/progress.js";
import type {
  CategoryProjection,
  CategoryProjectionOptions,
} from "#lib/engine/projections/category-projection.js";
import type { SearchCandidate, SearchContext } from "#lib/engine/search.js";
import type { Path } from "$app/types";

/**
 * One category's capabilities. Every category has a projection, whose `totals` are the category's
 * progress, and a page; search is optional.
 */
export interface CategoryDefinition {
  /** The category's rows & progress totals in one context. */
  project: (ctx: ProgressContext, options?: CategoryProjectionOptions) => CategoryProjection;
  /** The category's page, under `src/routes/(category)/`. */
  route: Path;
  /** Search candidates read from the category's own projection; omitted, it has no results. */
  search?: (context: SearchContext) => Iterable<SearchCandidate>;
}

/**
 * The categories, keyed and ordered by key. An entry here gives a category its progress (the header,
 * home page, & `/everything`) and, with `search`, cross-category search results. A new category
 * also needs:
 *
 * - its projection in `engine/projections/`;
 * - with search: a provider in `engine/search-providers.ts`, plus a report category & a toggle `case`
 *   in `components/search-results.svelte`, or clicking its results does nothing;
 * - its name & description in `data/categories.ts`, since the engine can't import messages;
 * - its page: a `+page.ts` & `+page.svelte` in `src/routes/(category)/<route>/`, and the path in
 *   `PRERENDERED_ROUTES` (`i18n/prerender-entries.ts`);
 * - its content on `/everything`, in `routes/everything/category-section.svelte`;
 * - its place in `/everything`'s source grouping: rows in `controllers/source-checklist.ts`, or, for a
 *   category without sources, the Progress group in `routes/everything/source-content.svelte`;
 * - with sourced rows: its source types in `categorySourceTypes` (`data/tracker-index.ts`), which its
 *   page's source filters read;
 * - its icon in `components/icon/icon-maps.ts`, & its `--color-category-<key>` colors in `app.css`.
 *
 * New progress fields also need a storage version bump & a migration (`docs/app-architecture.md`).
 *
 * The name, description, content, icon, & search report maps are keyed by category, so
 * type-checking fails until each has the new key. `prerender-entries.test.ts` fails until the page
 * & its path agree. Nothing checks the toggle `case`, the source grouping, or the source types.
 */
export const CATEGORIES = {
  almanac: { project: projectAlmanac, route: "almanac", search: searchAlmanac },
  animals: { project: projectAnimals, route: "animals", search: searchAnimals },
  cosmetics: { project: projectCosmetics, route: "cosmetics", search: searchCosmetics },
  mines: { project: projectMines, route: "mines" },
  museum: { project: projectMuseum, route: "museum", search: searchMuseum },
  quests: { project: projectQuests, route: "quests", search: searchQuests },
  recipes: { project: projectRecipes, route: "recipes", search: searchRecipes },
  renown: { project: projectRenown, route: "renown" },
  skills: { project: projectSkills, route: "skills" },
  villagers: { project: projectVillagers, route: "villagers", search: searchVillagers },
} as const satisfies Record<string, CategoryDefinition>;

export type AllProgress = Record<CategoryKey, CategoryProgress>;
export type CategoryKey = keyof typeof CATEGORIES;

/** Category keys the cross-category search produces results for: those with `search`. */
export type SearchCategoryKey = {
  [Key in CategoryKey]: (typeof CATEGORIES)[Key] extends { search: unknown } ? Key : never;
}[CategoryKey];

export const CATEGORY_KEYS: readonly CategoryKey[] = recordKeys(CATEGORIES);

/** The registry as uniform definitions, for callers that visit every category alike. */
export const CATEGORY_DEFINITIONS: readonly CategoryDefinition[] = recordValues(CATEGORIES);

export function getAllProgress(
  ctx: ProgressContext,
  options?: CategoryProjectionOptions,
): AllProgress {
  return recordMap(
    CATEGORIES,
    (definition: CategoryDefinition) => definition.project(ctx, options).totals,
  );
}

export function getCategoryProgress(
  category: CategoryKey,
  ctx: ProgressContext,
  options?: CategoryProjectionOptions,
): CategoryProgress {
  const definition: CategoryDefinition = CATEGORIES[category];
  return definition.project(ctx, options).totals;
}

/** Sums every category's progress into one overall total (home page, `/everything`). */
export function getOverallProgress(allProgress: AllProgress): CategoryProgress {
  return addProgress(recordValues(allProgress));
}

/**
 * Whether a category is at 100%. This is the single completion rule behind the header's progress,
 * the all-completed banner, & the category celebration, so the three can never disagree.
 */
export function isCategoryComplete(category: CategoryKey, ctx: ProgressContext): boolean {
  const { completed, total } = getCategoryProgress(category, ctx);
  return completed >= total;
}
