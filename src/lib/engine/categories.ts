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
import { recordKeys, recordMap, recordValues } from "#lib/utils/record.js";

import type { CategoryProgress, ProgressContext } from "#lib/engine/progress.js";
import type {
  CategoryProjection,
  CategoryProjectionOptions,
} from "#lib/engine/projections/category-projection.js";
import type { SearchCandidate, SearchContext } from "#lib/engine/search.js";
import type { Path } from "$app/types";

/**
 * One category's capabilities. Every category has a projection, and its `totals` are the
 * category's progress; a route & search are optional.
 */
export interface CategoryDefinition {
  /** The category's rows & progress totals in one context. */
  project: (ctx: ProgressContext, options?: CategoryProjectionOptions) => CategoryProjection;
  /** The category's page. */
  route?: Path;
  /** Search candidates read from the category's own projection; omitted, it has no results. */
  search?: (context: SearchContext) => Iterable<SearchCandidate>;
}

/**
 * The categories, keyed and ordered by key. Adding a category here gives it progress (the header,
 * home page, & `/everything`) and, with the optional capabilities, a route & search results.
 * Localized names live in `data/categories.ts`, since the engine can't import messages.
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

export function getAllProgress(ctx: ProgressContext): AllProgress {
  return recordMap(CATEGORIES, (definition: CategoryDefinition) => definition.project(ctx).totals);
}

export function getCategoryProgress(category: CategoryKey, ctx: ProgressContext): CategoryProgress {
  const definition: CategoryDefinition = CATEGORIES[category];
  return definition.project(ctx).totals;
}

/** Sums every category's progress into one overall total (home page, `/everything`). */
export function getOverallProgress(allProgress: AllProgress): CategoryProgress {
  let completed = 0;
  let remainingInScope = 0;
  let total = 0;
  for (const p of recordValues(allProgress)) {
    completed += p.completed;
    remainingInScope += p.remainingInScope;
    total += p.total;
  }
  return { completed, remainingInScope, total };
}

/**
 * Whether a category is at 100%. This is the single completion rule behind the header's progress,
 * the all-completed banner, & the category celebration, so the three can never disagree.
 */
export function isCategoryComplete(category: CategoryKey, ctx: ProgressContext): boolean {
  const { completed, total } = getCategoryProgress(category, ctx);
  return completed >= total;
}
