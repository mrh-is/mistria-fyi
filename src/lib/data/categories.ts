import { getName, nameCollator } from "#lib/data/names.js";
import { CATEGORIES, CATEGORY_KEYS } from "#lib/engine/categories.js";

import type { CategoryKey } from "#lib/engine/categories.js";
import type { LocaleCode } from "#lib/types/locale.js";
import type { Path } from "$app/types";

export interface CategoryInfo {
  color: string;
  description: string;
  href: Path;
  name: string;
}

/**
 * Localized labels for the engine's category registry (`engine/categories.ts`), which can't import
 * messages. Category names are the game's own words wherever it has one (the `ui` chunk, awaited by the
 * root layout); only concepts the game never labels on their own fall back to MFG's messages.
 */
const CATEGORY_NAMES: Record<CategoryKey, (locale: LocaleCode) => string> = {
  almanac: (locale) => getName("ui", "almanac", locale),
  animals: (locale) => getName("ui", "animals", locale),
  cosmetics: (_locale) => "Cosmetics",
  mines: (_locale) => "Mines",
  museum: (locale) => getName("ui", "museum", locale),
  quests: (_locale) => "Quests",
  recipes: (_locale) => "Recipes",
  renown: (locale) => getName("ui", "renown", locale),
  skills: (locale) => getName("ui", "skills", locale),
  villagers: (locale) => getName("ui", "villagers", locale),
};

const CATEGORY_DESCRIPTIONS: Record<CategoryKey, (locale: LocaleCode) => string> = {
  almanac: (_locale) => "Crops, fish, forage, & more",
  animals: (_locale) => "Breeds, variants, & cosmetics",
  cosmetics: (_locale) => "Wardrobe & appearance",
  mines: (_locale) => "Floors & spells",
  museum: (_locale) => "Collections & donations",
  quests: (_locale) => "Story & requests",
  recipes: (_locale) => "Cooking & crafting",
  renown: (locale) => getName("ui", "town_rank", locale),
  skills: (locale) => getName("ui", "skill_levels", locale),
  villagers: (_locale) => "Friendship & relationships",
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
    href: CATEGORIES[key].route,
    name: CATEGORY_NAMES[key](locale),
  };
}

/** Look up a category key from its public route. */
export function categoryKeyForPathname(pathname: string): CategoryKey | undefined {
  return CATEGORY_KEYS.find((key) => `/${CATEGORIES[key].route}` === pathname);
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
