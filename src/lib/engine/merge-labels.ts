import * as m from "$lib/paraglide/messages.js";

import type { MergeCounts } from "$lib/stores/user-state.svelte.js";

interface MergeCountLabel {
  /**
   * When true, the field is boolean-like (0 or 1) and displays just the
   * localized label with no numeric prefix when non-zero.
   */
  boolean?: boolean;
  /** Localized display text for this entry, given its non-zero count. */
  format: (count: number) => string;
}

/**
 * Exhaustive mapping from every `MergeCounts` key to its display metadata.
 * The `satisfies` clause ensures a compile-time error if `MergeCounts` gains
 * or loses a field.
 */
export const MERGE_COUNT_LABELS = {
  almanac: { format: (count: number) => m.merge_label_almanac({ count }) },
  almanacRecipes: { format: (count: number) => m.merge_label_almanac_recipes({ count }) },
  animalCosmetics: { format: (count: number) => m.merge_label_animal_cosmetics({ count }) },
  animals: { format: (count: number) => m.merge_label_animals({ count }) },
  childChoice: { boolean: true, format: () => m.merge_label_child_choice() },
  cosmetics: { format: (count: number) => m.merge_label_cosmetics({ count }) },
  dates: { format: (count: number) => m.merge_label_dates({ count }) },
  hasUpperFloor: { boolean: true, format: () => m.merge_label_has_upper_floor() },
  mineFloor: { format: (count: number) => m.merge_label_mine_floor({ count }) },
  museum: { format: (count: number) => m.merge_label_museum({ count }) },
  npcLevels: { format: (count: number) => m.merge_label_npc_levels({ count }) },
  npcRelationships: { format: (count: number) => m.merge_label_npc_relationships({ count }) },
  perks: { format: (count: number) => m.merge_label_perks({ count }) },
  petCosmetics: { format: (count: number) => m.merge_label_pet_cosmetics({ count }) },
  petSkins: { format: (count: number) => m.merge_label_pet_skins({ count }) },
  quests: { format: (count: number) => m.merge_label_quests({ count }) },
  reachedSeason: { boolean: true, format: () => m.merge_label_reached_season() },
  renown: { format: (count: number) => m.merge_label_renown({ count }) },
  skillLevels: { format: (count: number) => m.merge_label_skill_levels({ count }) },
  spells: { format: (count: number) => m.merge_label_spells({ count }) },
} as const satisfies Record<keyof MergeCounts, MergeCountLabel>;

export type MergeCountKey = keyof typeof MERGE_COUNT_LABELS;

/**
 * Format a single merge-count entry for display.
 * Returns `null` when the count is zero.
 */
export function formatMergeCount(key: MergeCountKey, count: number): null | string {
  if (count === 0) return null;
  return MERGE_COUNT_LABELS[key].format(count);
}

/** Sum all values in a `MergeCounts` object. */
export function totalMergeCounts(counts: MergeCounts): number {
  let total = 0;
  for (const key of Object.keys(MERGE_COUNT_LABELS) as MergeCountKey[]) {
    total += counts[key];
  }
  return total;
}
