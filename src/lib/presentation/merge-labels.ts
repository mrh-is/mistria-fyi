import * as m from "#lib/paraglide/messages.js";
import { formatNumber } from "#lib/utils/format.js";

import type { LocaleCode } from "#lib/types/locale.js";
import type { MergeCounts } from "#lib/types/user-progress.js";

interface MergeCountLabel {
  /**
   * When true, the field is boolean-like (0 or 1) and displays just the
   * localized label with no numeric prefix when non-zero.
   */
  boolean?: boolean;
  /** Localized display text for this entry, given its non-zero count. */
  format: (inputs: { count: number; countText: string }, options: { locale: LocaleCode }) => string;
}

/**
 * Exhaustive mapping from every `MergeCounts` key to its display metadata.
 * The `satisfies` clause ensures a compile-time error if `MergeCounts` gains
 * or loses a field.
 */
export const MERGE_COUNT_LABELS = {
  almanac: { format: m.merge_label_almanac },
  almanacRecipes: { format: m.merge_label_almanac_recipes },
  animalCosmetics: { format: m.merge_label_animal_cosmetics },
  animals: { format: m.merge_label_animals },
  breakUpsDisabled: {
    boolean: true,
    format: m.merge_label_break_ups_disabled,
  },
  childChoice: { boolean: true, format: m.merge_label_child_choice },
  cosmetics: { format: m.merge_label_cosmetics },
  hasUpperFloor: { boolean: true, format: m.merge_label_has_upper_floor },
  heartLevels: { format: m.merge_label_heart_levels },
  mineFloor: { format: m.merge_label_mine_floor },
  mountAppearances: { format: m.merge_label_mount_appearances },
  museum: { format: m.merge_label_museum },
  perks: { format: m.merge_label_perks },
  petCosmetics: { format: m.merge_label_pet_cosmetics },
  petSkins: { format: m.merge_label_pet_skins },
  quests: { format: m.merge_label_quests },
  reachedSeason: { boolean: true, format: m.merge_label_reached_season },
  renown: { format: m.merge_label_renown },
  skillLevels: { format: m.merge_label_skill_levels },
  spells: { format: m.merge_label_spells },
  villagerRelationships: {
    format: m.merge_label_villager_relationships,
  },
} as const satisfies Record<keyof MergeCounts, MergeCountLabel>;

export type MergeCountKey = keyof typeof MERGE_COUNT_LABELS;

/**
 * Format a single merge-count entry for display.
 * Returns `null` when the count is zero.
 */
export function formatMergeCount(
  key: MergeCountKey,
  count: number,
  locale: LocaleCode,
): null | string {
  if (count === 0) return null;
  return MERGE_COUNT_LABELS[key].format(
    { count, countText: formatNumber(count, locale) },
    { locale },
  );
}

/** Sum all values in a `MergeCounts` object. */
export function totalMergeCounts(counts: MergeCounts): number {
  let total = 0;
  for (const key of Object.keys(MERGE_COUNT_LABELS) as MergeCountKey[]) {
    total += counts[key];
  }
  return total;
}
