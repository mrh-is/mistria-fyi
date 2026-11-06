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
  /**
   * Whether its rows have sources. A sourced category lists its rows in the source checklist & has
   * source filters; an unsourced one joins the Progress group when `/everything` groups by source.
   */
  sourced: boolean;
}

/**
 * The categories, keyed and ordered by key. An entry gives a category its progress (the header,
 * home page, & `/everything`) and, with `search`, cross-category search results. Type-checking &
 * tests name every other piece a new category needs, from its localized name to its page; only its
 * `--color-category-<key>` colors in `app.css` go unchecked.
 */
export const CATEGORIES = {
  almanac: { project: projectAlmanac, route: "almanac", search: searchAlmanac, sourced: true },
  animals: { project: projectAnimals, route: "animals", search: searchAnimals, sourced: true },
  cosmetics: {
    project: projectCosmetics,
    route: "cosmetics",
    search: searchCosmetics,
    sourced: true,
  },
  mines: { project: projectMines, route: "mines", sourced: true },
  museum: { project: projectMuseum, route: "museum", search: searchMuseum, sourced: true },
  quests: { project: projectQuests, route: "quests", search: searchQuests, sourced: true },
  recipes: { project: projectRecipes, route: "recipes", search: searchRecipes, sourced: true },
  renown: { project: projectRenown, route: "renown", sourced: false },
  skills: { project: projectSkills, route: "skills", sourced: false },
  villagers: {
    project: projectVillagers,
    route: "villagers",
    search: searchVillagers,
    sourced: false,
  },
} as const satisfies Record<string, CategoryDefinition>;

export type AllProgress = Record<CategoryKey, CategoryProgress>;
export type CategoryKey = keyof typeof CATEGORIES;

/** Category keys the cross-category search produces results for: those with `search`. */
export type SearchCategoryKey = {
  [Key in CategoryKey]: (typeof CATEGORIES)[Key] extends { search: unknown } ? Key : never;
}[CategoryKey];

/** Category keys whose rows have sources: the source checklist & source filters cover these. */
export type SourcedCategoryKey = {
  [Key in CategoryKey]: (typeof CATEGORIES)[Key] extends { sourced: true } ? Key : never;
}[CategoryKey];

/** Category keys without sources, which `/everything` shows in its Progress group by source. */
export type UnsourcedCategoryKey = Exclude<CategoryKey, SourcedCategoryKey>;

export const CATEGORY_KEYS: readonly CategoryKey[] = recordKeys(CATEGORIES);

export const UNSOURCED_CATEGORY_KEYS = CATEGORY_KEYS.filter(
  (key): key is UnsourcedCategoryKey => !CATEGORIES[key].sourced,
);

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
