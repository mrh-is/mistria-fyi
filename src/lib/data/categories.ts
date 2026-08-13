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
  href: Pathname;
  name: string;
}

export type CategoryKey = (typeof CATEGORY_KEYS)[number];

/** Lookup a single category by key. */
export function categoryForKey(key: CategoryKey): CategoryInfo {
  return {
    color: `cat-${key}`,
    href: `/${key}`,
    name: key === "npcs" ? "NPCs" : capitalize(key),
  };
}

const capitalize = <T extends string>(s: T) =>
  (s[0].toUpperCase() + s.slice(1)) as Capitalize<typeof s>;
