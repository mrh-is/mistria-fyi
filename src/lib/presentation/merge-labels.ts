import plural from "#lib/i18n/catalogs/plural.js";
import { inLocale } from "#lib/i18n/locale-runtime.js";
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
  format: (count: number, countText: string) => string;
}

/**
 * Exhaustive mapping from every `MergeCounts` key to its display metadata.
 * The `satisfies` clause ensures a compile-time error if `MergeCounts` gains
 * or loses a field.
 */
export const MERGE_COUNT_LABELS = {
  almanac: { format: (_count, countText) => `Almanac: +${countText}` },
  almanacRecipes: { format: (_count, countText) => `Recipes: +${countText}` },
  animalCosmetics: { format: (_count, countText) => `Animal cosmetics: +${countText}` },
  animals: { format: (_count, countText) => `Animal variants: +${countText}` },
  breakUpsDisabled: {
    boolean: true,
    format: () => /* @wc-context: save import summary */ "Break-ups disabled",
  },
  childChoice: { boolean: true, format: () => "Child choice updated" },
  cosmetics: { format: (_count, countText) => `Cosmetics: +${countText}` },
  hasUpperFloor: { boolean: true, format: () => "Upper floor unlocked" },
  heartLevels: {
    format: (count, countText) =>
      plural(count, [
        `Villager hearts: +${countText} relationship updated`,
        `Villager hearts: +${countText} relationships updated`,
      ]),
  },
  mineFloor: {
    format: (count, countText) =>
      plural(count, [`Mine floor: +${countText} floor`, `Mine floor: +${countText} floors`]),
  },
  mountAppearances: { format: (_count, countText) => `Mount appearances: +${countText}` },
  museum: { format: (_count, countText) => `Museum donations: +${countText}` },
  perks: { format: (_count, countText) => `Perks: +${countText}` },
  petCosmetics: { format: (_count, countText) => `Pet cosmetics: +${countText}` },
  petSkins: { format: (_count, countText) => `Pet skins: +${countText}` },
  quests: { format: (_count, countText) => `Quests: +${countText}` },
  reachedSeason: {
    boolean: true,
    format: () => "Season progression updated",
  },
  renown: {
    format: (count, countText) =>
      plural(count, [`Renown: +${countText} level`, `Renown: +${countText} levels`]),
  },
  skillLevels: {
    format: (count, countText) =>
      plural(count, [
        `Skills: +${countText} skill updated`,
        `Skills: +${countText} skills updated`,
      ]),
  },
  spells: { format: (_count, countText) => `Spells: +${countText}` },
  villagerRelationships: {
    format: (_count, countText) => `Villager relationships: +${countText}`,
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
  return inLocale(locale, () => MERGE_COUNT_LABELS[key].format(count, formatNumber(count, locale)));
}

/** Sum all values in a `MergeCounts` object. */
export function totalMergeCounts(counts: MergeCounts): number {
  let total = 0;
  for (const key of Object.keys(MERGE_COUNT_LABELS) as MergeCountKey[]) {
    total += counts[key];
  }
  return total;
}
