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

const CATEGORY_DESCRIPTIONS: Record<CategoryKey, string> = {
  almanac: "Crops, fish, forage, & more",
  animals: "Breeds, variants, & cosmetics",
  cosmetics: "Wardrobe & appearance",
  mines: "Floors & spells",
  museum: "Collections & donations",
  npcs: "Friendship & relationships",
  quests: "Story & requests",
  recipes: "Cooking & crafting",
  renown: "Town rank",
  skills: "Skill levels",
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
    description: CATEGORY_DESCRIPTIONS[key],
    href: CATEGORY_HREFS[key],
    name: key === "npcs" ? "Characters" : capitalize(key),
  };
}

/** Look up a category key from its public route. */
export function categoryKeyForPathname(pathname: string): CategoryKey | undefined {
  return CATEGORY_KEYS.find((key) => CATEGORY_HREFS[key] === pathname);
}

export function sortCategoryKeysByName(keys: readonly CategoryKey[]): CategoryKey[] {
  return [...keys].sort((left, right) => {
    const nameOrder = categoryForKey(left).name.localeCompare(categoryForKey(right).name);
    return nameOrder !== 0 ? nameOrder : left.localeCompare(right);
  });
}

const capitalize = <T extends string>(s: T) =>
  (s[0].toUpperCase() + s.slice(1)) as Capitalize<typeof s>;
