import {
  BookCheck,
  BookOpenText,
  Crown,
  Heart,
  Landmark,
  PawPrint,
  Pickaxe,
  ScrollText,
  Shirt,
} from "@lucide/svelte";

import type { Component } from "svelte";

export type CategoryKey =
  | "almanac"
  | "animals"
  | "cosmetics"
  | "mines"
  | "museum"
  | "npcs"
  | "quests"
  | "renown"
  | "skills";

export interface CategoryMeta {
  color: string;
  href: string;
  icon: Component<{ class?: string }>;
  key: CategoryKey;
  name: string;
}

export const CATEGORIES: readonly CategoryMeta[] = [
  { color: "cat-museum", href: "/museum", icon: Landmark, key: "museum", name: "Museum" },
  { color: "cat-almanac", href: "/almanac", icon: BookCheck, key: "almanac", name: "Almanac" },
  { color: "cat-animals", href: "/animals", icon: PawPrint, key: "animals", name: "Animals" },
  { color: "cat-npcs", href: "/npcs", icon: Heart, key: "npcs", name: "NPCs" },
  { color: "cat-cosmetics", href: "/cosmetics", icon: Shirt, key: "cosmetics", name: "Cosmetics" },
  { color: "cat-skills", href: "/skills", icon: BookOpenText, key: "skills", name: "Skills" },
  { color: "cat-renown", href: "/renown", icon: Crown, key: "renown", name: "Renown" },
  { color: "cat-quests", href: "/quests", icon: ScrollText, key: "quests", name: "Quests" },
  { color: "cat-mines", href: "/mines", icon: Pickaxe, key: "mines", name: "Mines" },
] as const;

/** Lookup a single category by key. */
export const CATEGORY_BY_KEY: Record<CategoryKey, CategoryMeta> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c]),
) as Record<CategoryKey, CategoryMeta>;
