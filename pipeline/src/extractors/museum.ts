import type { ItemId, SetId, TrackerData, WingId } from "$lib/types/tracker-data.js";

import type { FiddleData } from "../parse-fiddle.js";

export function extractMuseum(fiddle: FiddleData): TrackerData["museum"] {
  const wings = fiddle.museum_wings as Record<string, Record<string, unknown>> | undefined;
  if (!wings) return {} as TrackerData["museum"];

  const result = {} as Record<WingId, TrackerData["museum"][WingId]>;

  for (const [wingId, wing] of Object.entries(wings)) {
    const rawSets = wing.sets as Record<string, Record<string, unknown>> | undefined;
    if (!rawSets) continue;

    const sets = {} as Record<SetId, { items: ItemId[]; name: string }>;
    for (const [setId, set] of Object.entries(rawSets)) {
      const items = (set.items as string[] | undefined) ?? [];
      sets[setId as SetId] = {
        items: items as ItemId[],
        name: (set.name as string | undefined) ?? setId,
      };
    }

    result[wingId as WingId] = {
      name: (wing.name as string | undefined) ?? wingId,
      sets,
    };
  }

  const totalSets = Object.values(result).reduce((n, w) => n + Object.keys(w.sets).length, 0);
  const totalItems = Object.values(result).reduce(
    (n, w) => n + Object.values(w.sets).reduce((m, s) => m + s.items.length, 0),
    0,
  );
  console.log(
    `  Museum: ${Object.keys(result).length} wings, ${totalSets} sets, ${totalItems} items`,
  );
  return result;
}
