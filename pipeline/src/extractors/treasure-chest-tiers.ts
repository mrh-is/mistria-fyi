import { LOCALE_CODES } from "#lib/types/locale.js";

import { compareStrings } from "../ordering.js";

import type { LocaleCode } from "#lib/types/locale.js";
import type { TreasureChestTier, TreasureChestTierId } from "#lib/types/tracker-data.js";

import type { Localizer } from "../localize.js";
import type { ParsedGameData } from "../parse-fiddle.js";

/**
 * Tiers whose chest isn't a `fish/misc/treasure_box_<tier>` item. The `abyss` table fills the
 * Abyssal Chest the Abyssal Ascendence perk lets you fish up.
 */
const REVIEWED_TIER_ITEMS: Partial<Record<string, { category: string; itemId: string }>> = {
  abyss: { category: "other/misc", itemId: "abyssal_chest" },
};

export function extractTreasureChestTiers(
  fiddle: ParsedGameData,
  localizer: Localizer,
): {
  localeNames: Record<LocaleCode, Record<TreasureChestTierId, string>>;
  tiers: Record<TreasureChestTierId, TreasureChestTier>;
} {
  const localeNames = Object.fromEntries(LOCALE_CODES.map((locale) => [locale, {}])) as Record<
    LocaleCode,
    Record<TreasureChestTierId, string>
  >;
  const fishing = fiddle.fishing as Record<string, unknown> | undefined;
  if (!fishing) return { localeNames, tiers: {} };

  const chestTables = fishing.chest_tables as Record<string, unknown> | undefined;
  if (!chestTables) return { localeNames, tiers: {} };

  const items = fiddle.items as
    | Record<string, Record<string, Record<string, Record<string, unknown>>>>
    | undefined;

  const result = {} as Record<TreasureChestTierId, TreasureChestTier>;

  for (const tier of Object.keys(chestTables).toSorted(compareStrings)) {
    const { category, itemId: itemKey } = REVIEWED_TIER_ITEMS[tier] ?? {
      category: "fish/misc",
      itemId: `treasure_box_${tier}`,
    };
    const [top, sub] = category.split("/");
    const name = items?.[top]?.[sub]?.[itemKey]?.name;
    if (typeof name !== "string" || name === "") {
      throw new Error(
        `Chest tier "${tier}" has no item "${category}/${itemKey}" — add it to REVIEWED_TIER_ITEMS`,
      );
    }

    const tierId = tier as TreasureChestTierId;
    result[tierId] = {};
    const { values } = localizer.localizeField({
      category: `items/${category}`,
      classification: "localizable",
      englishValue: name,
      field: "name",
      id: itemKey,
    });
    for (const locale of LOCALE_CODES) localeNames[locale][tierId] = values[locale];
  }

  console.log(`  Treasure chest tiers: ${Object.keys(result).length}`);
  return { localeNames, tiers: result };
}
