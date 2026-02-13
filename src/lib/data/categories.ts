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

// ─── Single source of truth ────────────────────────────────────────

const CATEGORIES_INTERNAL = [
  { icon: Landmark, key: "museum", name: "Museum" },
  { icon: BookCheck, key: "almanac", name: "Almanac" },
  { icon: PawPrint, key: "animals", name: "Animals" },
  { icon: Heart, key: "npcs", name: "NPCs" },
  { icon: Shirt, key: "cosmetics", name: "Cosmetics" },
  { icon: BookOpenText, key: "skills", name: "Skills" },
  { icon: Crown, key: "renown", name: "Renown" },
  { icon: ScrollText, key: "quests", name: "Quests" },
  { icon: Pickaxe, key: "mines", name: "Mines" },
] as const satisfies ReadonlyArray<{
  icon: Component<{ class?: string }>;
  key: string;
  name: string;
}>;

export type CategoryKey = (typeof CATEGORIES_INTERNAL)[number]["key"];

// ─── Public types & helpers ────────────────────────────────────────

export interface CategoryMeta {
  icon: Component<{ class?: string }>;
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
