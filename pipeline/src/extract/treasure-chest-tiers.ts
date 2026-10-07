import { LOCALE_CODES } from "#lib/types/locale.js";

import { compareStrings } from "../ordering.js";

import type { LocaleCode } from "#lib/types/locale.js";
import type { TreasureChestTier, TreasureChestTierId } from "#lib/types/tracker-data.js";

import type { Localizer } from "../localize/localize.js";
import type { ParsedGameData } from "../parse/parse-fiddle.js";

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
  const fishMisc = items?.fish?.misc;

  const result = {} as Record<TreasureChestTierId, TreasureChestTier>;

  for (const tier of Object.keys(chestTables).toSorted(compareStrings)) {
    const itemKey = `treasure_box_${tier}`;
    const itemData = fishMisc?.[itemKey];
    const name = itemData?.name as string | undefined;
    if (!name) {
      console.log(`  Skipping chest tier "${tier}" — no matching item "${itemKey}"`);
      continue;
    }

    const tierId = tier as TreasureChestTierId;
    result[tierId] = {};
    const { values } = localizer.localizeField({
      category: "items/fish/misc",
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
