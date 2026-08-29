import trackerDataJson from "./tracker-data.json";

import type { ItemId, TrackerData } from "$lib/types/tracker-data.js";

export const trackerData = trackerDataJson as unknown as TrackerData;

function buildCanonicalAlmanacLookup(): Map<ItemId, ItemId> {
  const lookup = new Map<ItemId, ItemId>();
  for (const category of Object.values(trackerData.almanac)) {
    for (const entry of category.items) {
      const canonical = entry.itemIds[0];
      for (const memberId of entry.itemIds) {
        lookup.set(memberId, canonical);
      }
    }
  }
  return lookup;
}

export const canonicalAlmanacId = buildCanonicalAlmanacLookup();
