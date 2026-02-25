import type { ItemId, MuseumWing, SetId, WingId } from "$lib/types/tracker-data.js";

import type { FiddleData } from "../parse-fiddle.js";

export function extractMuseum(fiddle: FiddleData): MuseumWing[] {
  const wings = fiddle.museum_wings as Record<string, Record<string, unknown>> | undefined;
  if (!wings) return [];

  // Read wing ordering and per-wing set ordering from UI data
  const { setOrders, wingOrder } = readMuseumOrdering(fiddle);

  // Use UI wing order if available, otherwise fall back to Object.keys
  const orderedWingIds = wingOrder.length > 0 ? wingOrder : Object.keys(wings);

  const result: MuseumWing[] = [];

  for (const wingId of orderedWingIds) {
    const wing = wings[wingId] as Record<string, unknown> | undefined;
    if (!wing) continue;

    const rawSets = wing.sets as Record<string, Record<string, unknown>> | undefined;
    if (!rawSets) continue;

    // Use UI set order if available, otherwise fall back to Object.keys
    const setOrder = setOrders[wingId];
    const orderedSetIds = setOrder && setOrder.length > 0 ? setOrder : Object.keys(rawSets);

    const sets: { id: SetId; items: ItemId[]; name: string }[] = [];
    for (const setId of orderedSetIds) {
      const set = rawSets[setId] as Record<string, unknown> | undefined;
      if (!set) continue;

      const items = (set.items as string[] | undefined) ?? [];
      sets.push({
        id: setId as SetId,
        items: items as ItemId[],
        name: (set.name as string | undefined) ?? setId,
      });
    }

    result.push({
      id: wingId as WingId,
      name: (wing.name as string | undefined) ?? wingId,
      sets,
    });
  }

  const totalSets = result.reduce((n, w) => n + w.sets.length, 0);
  const totalItems = result.reduce((n, w) => n + w.sets.reduce((m, s) => m + s.items.length, 0), 0);
  console.log(`  Museum: ${result.length} wings, ${totalSets} sets, ${totalItems} items`);
  return result;
}

/**
 * Read museum wing ordering and per-wing set ordering from UI data.
 * Located at `$.ui.menus.standard_menus.museum`.
 */
function readMuseumOrdering(fiddle: FiddleData): {
  setOrders: Record<string, string[]>;
  wingOrder: string[];
} {
  const ui = fiddle.ui as Record<string, unknown> | undefined;
  const menus = ui?.menus as Record<string, unknown> | undefined;
  const standardMenus = menus?.standard_menus as Record<string, unknown> | undefined;
  const museum = standardMenus?.museum as Record<string, unknown> | undefined;
  if (!museum) return { setOrders: {}, wingOrder: [] };

  // Wing order: museum.wings is { 0: { wing: "archaeology" }, 1: { wing: "fish" }, ... }
  const rawWings = museum.wings as Record<string, Record<string, unknown>> | undefined;
  const wingOrder: string[] = [];
  if (rawWings) {
    const sorted = Object.entries(rawWings).sort(([a], [b]) => Number(a) - Number(b));
    for (const [, entry] of sorted) {
      const wingId = entry.wing as string | undefined;
      if (wingId) wingOrder.push(wingId);
    }
  }

  // Set orders: museum.{wing}_order is { 0: "common_finds", 1: "prehistoric", ... }
  const setOrders: Record<string, string[]> = {};
  for (const wingId of wingOrder) {
    const orderKey = `${wingId}_order`;
    const rawOrder = museum[orderKey] as Record<string, string> | undefined;
    if (rawOrder) {
      setOrders[wingId] = Object.entries(rawOrder)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([, setId]) => setId);
    }
  }

  return { setOrders, wingOrder };
}
