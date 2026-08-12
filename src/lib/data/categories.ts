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

export interface CategoryMeta {
  icon: LucideIcon;
  key: CategoryKey;
  name: string;
}

/** CSS custom property name for a category's color, e.g. `"cat-museum"`. */
export function categoryColor(key: CategoryKey): string {
  return `cat-${key}`;
}

/** Route path for a category, e.g. `"/museum"`. */
export function categoryHref(key: CategoryKey): string {
  return `/${key}`;
}

export const CATEGORIES: readonly CategoryMeta[] = CATEGORIES_INTERNAL;

/** Lookup a single category by key. */
export const CATEGORY_BY_KEY: Record<CategoryKey, CategoryMeta> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c]),
) as Record<CategoryKey, CategoryMeta>;
