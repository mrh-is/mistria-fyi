import type { TreasureChestTier } from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle.js";

export function extractTreasureChestTiers(
  fiddle: ParsedGameData,
): Record<TreasureChestTier, { name: string }> {
  const fishing = fiddle.fishing as Record<string, unknown> | undefined;
  if (!fishing) return {};

  const chestTables = fishing.chest_tables as Record<string, unknown> | undefined;
  if (!chestTables) return {};

  const items = fiddle.items as
    Record<string, Record<string, Record<string, Record<string, unknown>>>> | undefined;
  const fishMisc = items?.fish?.misc;

  const result = {} as Record<TreasureChestTier, { name: string }>;

  for (const tier of Object.keys(chestTables).sort()) {
    const itemKey = `treasure_box_${tier}`;
    const itemData = fishMisc?.[itemKey];
    const name = itemData?.name as string | undefined;
    if (!name) {
      throw new Error(
        `Treasure chest tier "${tier}" has no matching item "${itemKey}" in items/fish/misc — check data assembly`,
      );
    }

    result[tier as TreasureChestTier] = { name };
  }

  console.log(`  Treasure chest tiers: ${Object.keys(result).length}`);
  return result;
}
