import plural from "#lib/i18n/catalogs/plural.js";
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
  format: (count: number, countText: string, locale: LocaleCode) => string;
}

/**
 * Exhaustive mapping from every `MergeCounts` key to its display metadata.
 * The `satisfies` clause ensures a compile-time error if `MergeCounts` gains
 * or loses a field.
 */
export const MERGE_COUNT_LABELS = {
  almanac: { format: (_count, countText, _locale) => `Almanac: +${countText}` },
  almanacRecipes: { format: (_count, countText, _locale) => `Recipes: +${countText}` },
  animalCosmetics: { format: (_count, countText, _locale) => `Animal cosmetics: +${countText}` },
  animals: { format: (_count, countText, _locale) => `Animal variants: +${countText}` },
  breakUpsDisabled: {
    boolean: true,
    format: (_count, _countText, _locale) =>
      /* @wc-context: save import summary */ "Break-ups disabled",
  },
  childChoice: { boolean: true, format: (_count, _countText, _locale) => "Child choice updated" },
  cosmetics: { format: (_count, countText, _locale) => `Cosmetics: +${countText}` },
  hasUpperFloor: { boolean: true, format: (_count, _countText, _locale) => "Upper floor unlocked" },
  heartLevels: {
    format: (count, countText, _locale) =>
      plural(count, [
        `Villager hearts: +${countText} relationship updated`,
        `Villager hearts: +${countText} relationships updated`,
      ]),
  },
  mineFloor: {
    format: (count, countText, _locale) =>
      plural(count, [`Mine floor: +${countText} floor`, `Mine floor: +${countText} floors`]),
  },
  mountAppearances: { format: (_count, countText, _locale) => `Mount appearances: +${countText}` },
  museum: { format: (_count, countText, _locale) => `Museum donations: +${countText}` },
  perks: { format: (_count, countText, _locale) => `Perks: +${countText}` },
  petCosmetics: { format: (_count, countText, _locale) => `Pet cosmetics: +${countText}` },
  petSkins: { format: (_count, countText, _locale) => `Pet skins: +${countText}` },
  quests: { format: (_count, countText, _locale) => `Quests: +${countText}` },
  reachedSeason: {
    boolean: true,
    format: (_count, _countText, _locale) => "Season progression updated",
  },
  renown: {
    format: (count, countText, _locale) =>
      plural(count, [`Renown: +${countText} level`, `Renown: +${countText} levels`]),
  },
  skillLevels: {
    format: (count, countText, _locale) =>
      plural(count, [
        `Skills: +${countText} skill updated`,
        `Skills: +${countText} skills updated`,
      ]),
  },
  spells: { format: (_count, countText, _locale) => `Spells: +${countText}` },
  villagerRelationships: {
    format: (_count, countText, _locale) => `Villager relationships: +${countText}`,
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
  return MERGE_COUNT_LABELS[key].format(count, formatNumber(count, locale), locale);
}

/** Sum all values in a `MergeCounts` object. */
export function totalMergeCounts(counts: MergeCounts): number {
  let total = 0;
  for (const key of Object.keys(MERGE_COUNT_LABELS) as MergeCountKey[]) {
    total += counts[key];
  }
  return total;
}
