import type { TreasureChestTierId } from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle.js";

export function extractTreasureChestTiers(
  fiddle: ParsedGameData,
): Record<TreasureChestTierId, { name: string }> {
  const fishing = fiddle.fishing as Record<string, unknown> | undefined;
  if (!fishing) return {};

  const chestTables = fishing.chest_tables as Record<string, unknown> | undefined;
  if (!chestTables) return {};

  const items = fiddle.items as
    Record<string, Record<string, Record<string, Record<string, unknown>>>> | undefined;
  const fishMisc = items?.fish?.misc;

  const result = {} as Record<TreasureChestTierId, { name: string }>;

  for (const tier of Object.keys(chestTables).sort()) {
    const itemKey = `treasure_box_${tier}`;
    const itemData = fishMisc?.[itemKey];
    const name = itemData?.name as string | undefined;
    if (!name) {
      console.log(`  Skipping chest tier "${tier}" — no matching item "${itemKey}"`);
      continue;
    }

    result[tier as TreasureChestTierId] = { name };
  }

  console.log(`  Treasure chest tiers: ${Object.keys(result).length}`);
  return result;
}
