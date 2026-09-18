import { LOCALE_CODES } from "$lib/types/locale.js";

import { localizeField } from "../localize.js";

import type { LocaleCode } from "$lib/types/locale.js";
import type { TreasureChestTierId } from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle.js";

export function extractTreasureChestTiers(
  fiddle: ParsedGameData,
  assetsDir: string,
): {
  localeNames: Record<LocaleCode, Record<TreasureChestTierId, string>>;
  tiers: Record<TreasureChestTierId, object>;
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
    Record<string, Record<string, Record<string, Record<string, unknown>>>> | undefined;
  const fishMisc = items?.fish?.misc;

  const result = {} as Record<TreasureChestTierId, object>;

  for (const tier of Object.keys(chestTables).sort()) {
    const itemKey = `treasure_box_${tier}`;
    const itemData = fishMisc?.[itemKey];
    const name = itemData?.name as string | undefined;
    if (!name) {
      console.log(`  Skipping chest tier "${tier}" — no matching item "${itemKey}"`);
      continue;
    }

    const tierId = tier as TreasureChestTierId;
    result[tierId] = {};
    const { values } = localizeField(assetsDir, {
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
