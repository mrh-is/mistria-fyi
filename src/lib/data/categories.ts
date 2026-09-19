import { getName } from "$lib/data/names.js";
import * as m from "$lib/paraglide/messages.js";

import type { Pathname } from "$app/types";
import type { LocaleCode } from "$lib/types/locale.js";

export const CATEGORY_KEYS = [
  "almanac",
  "animals",
  "cosmetics",
  "mines",
  "museum",
  "quests",
  "recipes",
  "renown",
  "skills",
  "villagers",
] as const;

export interface CategoryInfo {
  color: string;
  description: string;
  href: Pathname;
  name: string;
}

export type CategoryKey = (typeof CATEGORY_KEYS)[number];

/**
 * Category keys the cross-category search index produces results for. Kept as an explicit,
 * type-checked subset (via `satisfies`) rather than a capability flag, since it drives a type
 * (`SearchCategoryKey`), not runtime branching.
 */
export const SEARCH_RESULT_CATEGORY_KEYS = [
  "almanac",
  "animals",
  "cosmetics",
  "museum",
  "quests",
  "recipes",
  "villagers",
] as const satisfies readonly CategoryKey[];

export type SearchCategoryKey = (typeof SEARCH_RESULT_CATEGORY_KEYS)[number];

/**
 * Category names are the game's own words wherever it has one (the `ui` chunk, awaited by the
 * root layout); only concepts the game never labels on their own fall back to MFG's messages.
 */
const CATEGORY_NAMES: Record<CategoryKey, (locale: LocaleCode) => string> = {
  almanac: (locale) => getName("ui", "almanac", locale),
  animals: (locale) => getName("ui", "animals", locale),
  cosmetics: () => m.category_cosmetics_name(),
  mines: () => m.category_mines_name(),
  museum: (locale) => getName("ui", "museum", locale),
  quests: () => m.category_quests_name(),
  recipes: () => m.category_recipes_name(),
  renown: (locale) => getName("ui", "renown", locale),
  skills: (locale) => getName("ui", "skills", locale),
  villagers: (locale) => getName("ui", "villagers", locale),
};

const CATEGORY_DESCRIPTIONS: Record<CategoryKey, (locale: LocaleCode) => string> = {
  almanac: () => m.category_almanac_description(),
  animals: () => m.category_animals_description(),
  cosmetics: () => m.category_cosmetics_description(),
  mines: () => m.category_mines_description(),
  museum: () => m.category_museum_description(),
  quests: () => m.category_quests_description(),
  recipes: () => m.category_recipes_description(),
  renown: (locale) => getName("ui", "town_rank", locale),
  skills: (locale) => getName("ui", "skill_levels", locale),
  villagers: () => m.category_villagers_description(),
};

const CATEGORY_HREFS: Record<CategoryKey, Pathname> = {
  almanac: "/almanac",
  animals: "/animals",
  cosmetics: "/cosmetics",
  mines: "/mines",
  museum: "/museum",
  quests: "/quests",
  recipes: "/recipes",
  renown: "/renown",
  skills: "/skills",
  villagers: "/villagers",
};

/** The CSS color token for a category; the one lookup that needs no locale. */
export function categoryColor(key: CategoryKey): string {
  return `cat-${key}`;
}

/** Lookup a single category by key. */
export function categoryForKey(key: CategoryKey, locale: LocaleCode): CategoryInfo {
  return {
    color: categoryColor(key),
    description: CATEGORY_DESCRIPTIONS[key](locale),
    href: CATEGORY_HREFS[key],
    name: CATEGORY_NAMES[key](locale),
  };
}

/** Look up a category key from its public route. */
export function categoryKeyForPathname(pathname: string): CategoryKey | undefined {
  return CATEGORY_KEYS.find((key) => CATEGORY_HREFS[key] === pathname);
}

/** Display name for a category, or the raw key when it isn't a known category. */
export function categoryNameForKey(key: string, locale: LocaleCode): string {
  return isCategoryKey(key) ? CATEGORY_NAMES[key](locale) : key;
}

export function sortCategoryKeysByName(
  keys: readonly CategoryKey[],
  locale: LocaleCode,
): CategoryKey[] {
  return [...keys].sort((left, right) => {
    const nameOrder = CATEGORY_NAMES[left](locale).localeCompare(CATEGORY_NAMES[right](locale));
    return nameOrder !== 0 ? nameOrder : left.localeCompare(right);
  });
}

function isCategoryKey(key: string): key is CategoryKey {
  return (CATEGORY_KEYS as readonly string[]).includes(key);
}
