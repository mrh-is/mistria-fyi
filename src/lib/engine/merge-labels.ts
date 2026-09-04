import type { MergeCounts } from "$lib/stores/user-state.svelte.js";

interface MergeCountLabel {
  /**
   * When true, the field is boolean-like (0 or 1) and displays just the label
   * with no numeric prefix when non-zero.
   */
  boolean?: boolean;
  /** Display label shown before the count. */
  label: string;
  /** Suffix shown after the count, e.g. "floors" produces "+3 floors". */
  suffix?: string;
}

/**
 * Exhaustive mapping from every `MergeCounts` key to its display metadata.
 * The `satisfies` clause ensures a compile-time error if `MergeCounts` gains
 * or loses a field.
 */
export const MERGE_COUNT_LABELS = {
  almanac: { label: "Almanac" },
  almanacRecipes: { label: "Recipes" },
  animalCosmetics: { label: "Animal cosmetics" },
  animals: { label: "Animal variants" },
  childChoice: { boolean: true, label: "Child choice updated" },
  cosmetics: { label: "Cosmetics" },
  dates: { label: "Dates" },
  hasUpperFloor: { boolean: true, label: "Upper floor unlocked" },
  mineFloor: { label: "Mine floor", suffix: "floors" },
  museum: { label: "Museum donations" },
  npcLevels: { label: "NPC hearts", suffix: "relationships updated" },
  npcRelationships: { label: "NPC relationships" },
  perks: { label: "Perks" },
  petCosmetics: { label: "Pet cosmetics" },
  petSkins: { label: "Pet skins" },
  quests: { label: "Quests" },
  reachedSeason: { boolean: true, label: "Season progression updated" },
  renown: { label: "Renown", suffix: "levels" },
  skillLevels: { label: "Skills", suffix: "skills updated" },
  spells: { label: "Spells" },
} as const satisfies Record<keyof MergeCounts, MergeCountLabel>;

export type MergeCountKey = keyof typeof MERGE_COUNT_LABELS;

/**
 * Format a single merge-count entry for display.
 * Returns `null` when the count is zero.
 */
export function formatMergeCount(key: MergeCountKey, count: number): null | string {
  if (count === 0) return null;
  const meta: MergeCountLabel = MERGE_COUNT_LABELS[key];
  if (meta.boolean) return meta.label;
  if (meta.suffix) return `${meta.label}: +${count} ${meta.suffix}`;
  return `${meta.label}: +${count}`;
}

/** Sum all values in a `MergeCounts` object. */
export function totalMergeCounts(counts: MergeCounts): number {
  let total = 0;
  for (const key of Object.keys(MERGE_COUNT_LABELS) as MergeCountKey[]) {
    total += counts[key];
  }
  return total;
}
