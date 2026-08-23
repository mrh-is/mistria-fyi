import { forEachItem } from "../extractor-helpers.js";

import type { DateId, DateType, ItemId } from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle.js";

export function extractDates(fiddle: ParsedGameData): Record<DateId, DateType> {
  const dates = fiddle.dates as Record<string, Record<string, unknown>> | undefined;
  if (!dates) return {};

  const unlockItems = buildDateUnlockMap(fiddle);

  const result = {} as Record<DateId, DateType>;

  for (const [id, date] of Object.entries(dates)) {
    if (id === "default") continue;
    if (date.unlisted === true) continue;

    const name = date.name as string | undefined;
    if (!name) {
      throw new Error(`Date "${id}" is missing a name`);
    }

    const unlockItemId = unlockItems.get(id);
    if (!unlockItemId) {
      throw new Error(`Date "${id}" has no matching date_unlock item in fiddle.items`);
    }

    result[id as DateId] = {
      name,
      sources: [{ type: "date_inspiration", itemId: unlockItemId as ItemId }],
    };
  }

  console.log(`  Dates: ${Object.keys(result).length}`);
  return result;
}

function buildDateUnlockMap(fiddle: ParsedGameData): Map<string, string> {
  const map = new Map<string, string>();
  forEachItem(fiddle, (itemId, item) => {
    const dateUnlock = item.date_unlock as string | undefined;
    if (dateUnlock) {
      map.set(dateUnlock, itemId);
    }
  });
  return map;
}
