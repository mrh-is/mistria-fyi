import * as m from "$lib/paraglide/messages.js";

import type { Pathname } from "$app/types";

export const CATEGORY_KEYS = [
  "almanac",
  "animals",
  "cosmetics",
  "mines",
  "museum",
  "npcs",
  "quests",
  "recipes",
  "renown",
  "skills",
] as const;

export interface CategoryInfo {
  color: string;
  description: string;
  href: Pathname;
  name: string;
}

export type CategoryKey = (typeof CATEGORY_KEYS)[number];

const CATEGORY_NAMES: Record<CategoryKey, () => string> = {
  almanac: m.category_almanac_name,
  animals: m.category_animals_name,
  cosmetics: m.category_cosmetics_name,
  mines: m.category_mines_name,
  museum: m.category_museum_name,
  npcs: m.category_npcs_name,
  quests: m.category_quests_name,
  recipes: m.category_recipes_name,
  renown: m.category_renown_name,
  skills: m.category_skills_name,
};

const CATEGORY_DESCRIPTIONS: Record<CategoryKey, () => string> = {
  almanac: m.category_almanac_description,
  animals: m.category_animals_description,
  cosmetics: m.category_cosmetics_description,
  mines: m.category_mines_description,
  museum: m.category_museum_description,
  npcs: m.category_npcs_description,
  quests: m.category_quests_description,
  recipes: m.category_recipes_description,
  renown: m.category_renown_description,
  skills: m.category_skills_description,
};

const CATEGORY_HREFS: Record<CategoryKey, Pathname> = {
  almanac: "/almanac",
  animals: "/animals",
  cosmetics: "/cosmetics",
  mines: "/mines",
  museum: "/museum",
  npcs: "/characters",
  quests: "/quests",
  recipes: "/recipes",
  renown: "/renown",
  skills: "/skills",
};

/** Lookup a single category by key. */
export function categoryForKey(key: CategoryKey): CategoryInfo {
  return {
    color: `cat-${key}`,
    description: CATEGORY_DESCRIPTIONS[key](),
    href: CATEGORY_HREFS[key],
    name: CATEGORY_NAMES[key](),
  };
}

/** Look up a category key from its public route. */
export function categoryKeyForPathname(pathname: string): CategoryKey | undefined {
  return CATEGORY_KEYS.find((key) => CATEGORY_HREFS[key] === pathname);
}

/** Display name for a category, or the raw key when it isn't a known category. */
export function categoryNameForKey(key: string): string {
  return isCategoryKey(key) ? CATEGORY_NAMES[key]() : key;
}

export function sortCategoryKeysByName(keys: readonly CategoryKey[]): CategoryKey[] {
  return [...keys].sort((left, right) => {
    const nameOrder = categoryForKey(left).name.localeCompare(categoryForKey(right).name);
    return nameOrder !== 0 ? nameOrder : left.localeCompare(right);
  });
}

function isCategoryKey(key: string): key is CategoryKey {
  return (CATEGORY_KEYS as readonly string[]).includes(key);
}
