import { getName, nameCollator } from "#lib/data/names.js";
import * as m from "#lib/paraglide/messages.js";

import type { LocaleCode } from "#lib/types/locale.js";
import type { Path } from "$app/types";

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
  href: Path;
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
  cosmetics: (locale) => m.category_cosmetics_name({}, { locale }),
  mines: (locale) => m.category_mines_name({}, { locale }),
  museum: (locale) => getName("ui", "museum", locale),
  quests: (locale) => m.category_quests_name({}, { locale }),
  recipes: (locale) => m.category_recipes_name({}, { locale }),
  renown: (locale) => getName("ui", "renown", locale),
  skills: (locale) => getName("ui", "skills", locale),
  villagers: (locale) => getName("ui", "villagers", locale),
};

const CATEGORY_DESCRIPTIONS: Record<CategoryKey, (locale: LocaleCode) => string> = {
  almanac: (locale) => m.category_almanac_description({}, { locale }),
  animals: (locale) => m.category_animals_description({}, { locale }),
  cosmetics: (locale) => m.category_cosmetics_description({}, { locale }),
  mines: (locale) => m.category_mines_description({}, { locale }),
  museum: (locale) => m.category_museum_description({}, { locale }),
  quests: (locale) => m.category_quests_description({}, { locale }),
  recipes: (locale) => m.category_recipes_description({}, { locale }),
  renown: (locale) => getName("ui", "town_rank", locale),
  skills: (locale) => getName("ui", "skill_levels", locale),
  villagers: (locale) => m.category_villagers_description({}, { locale }),
};

const CATEGORY_HREFS: Record<CategoryKey, Path> = {
  almanac: "almanac",
  animals: "animals",
  cosmetics: "cosmetics",
  mines: "mines",
  museum: "museum",
  quests: "quests",
  recipes: "recipes",
  renown: "renown",
  skills: "skills",
  villagers: "villagers",
};

/** A category's color as a CSS `var()` reference; the one lookup that needs no locale. */
export function categoryColor<Key extends CategoryKey>(key: Key): `var(--color-category-${Key})` {
  return `var(--color-category-${key})`;
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
  return CATEGORY_KEYS.find((key) => `/${CATEGORY_HREFS[key]}` === pathname);
}

/** Display name for a category, or the raw key when it isn't a known category. */
export function categoryNameForKey(key: string, locale: LocaleCode): string {
  return isCategoryKey(key) ? CATEGORY_NAMES[key](locale) : key;
}

export function sortCategoryKeysByName(
  keys: readonly CategoryKey[],
  locale: LocaleCode,
): CategoryKey[] {
  return [...keys].toSorted((left, right) => {
    const nameOrder = nameCollator(locale).compare(
      CATEGORY_NAMES[left](locale),
      CATEGORY_NAMES[right](locale),
    );
    return nameOrder === 0 ? left.localeCompare(right) : nameOrder;
  });
}

function isCategoryKey(key: string): key is CategoryKey {
  return (CATEGORY_KEYS as readonly string[]).includes(key);
}
