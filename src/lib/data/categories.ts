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

/** Lookup a single category by key. */
export function categoryForKey(key: CategoryKey): CategoryInfo {
  return {
    color: `cat-${key}`,
    description: CATEGORY_DESCRIPTIONS[key],
    href: `/${key}`,
    name: key === "npcs" ? "Characters" : capitalize(key),
  };
}

const capitalize = <T extends string>(s: T) =>
  (s[0].toUpperCase() + s.slice(1)) as Capitalize<typeof s>;
