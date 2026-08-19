import { expectArray, expectStringArray } from "../data-shapes.js";
import { type ParsedGameData, sourceFileFor } from "../parse-fiddle.js";

import type { ItemId, MuseumWing, MuseumWingSetId, WingId } from "$lib/types/tracker-data.js";

/**
 * Projects museum wings and sets in the canonical UI display order. Object insertion order is only
 * a fallback when UI ordering is unavailable; ordered wing and set IDs absent from game data are skipped.
 */
export function extractMuseum(fiddle: ParsedGameData): MuseumWing[] {
  const wings = fiddle.museum_wings as Record<string, Record<string, unknown>> | undefined;
  if (!wings) return [];

  const { setOrders, wingOrder } = readMuseumOrdering(fiddle);
  const orderedWingIds = wingOrder.length > 0 ? wingOrder : Object.keys(wings);

  const result: MuseumWing[] = [];

  for (const wingId of orderedWingIds) {
    const wing = wings[wingId] as Record<string, unknown> | undefined;
    if (!wing) continue;

    const rawSets = wing.sets as Record<string, Record<string, unknown>> | undefined;
    if (!rawSets) continue;

    const setOrder = setOrders[wingId];
    const orderedSetIds = setOrder && setOrder.length > 0 ? setOrder : Object.keys(rawSets);

    const sourceFile = sourceFileFor(fiddle, `museum_wings.${wingId}`);

    const sets: { id: MuseumWingSetId; items: ItemId[]; name: string }[] = [];
    for (const setId of orderedSetIds) {
      const set = rawSets[setId] as Record<string, unknown> | undefined;
      if (!set) continue;

      const items = expectStringArray(set.items, {
        entityId: `${wingId}.${setId}`,
        fieldPath: "items",
        sourcePath: sourceFile,
      });

      sets.push({
        id: setId as MuseumWingSetId,
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

function readMuseumOrdering(fiddle: ParsedGameData): {
  setOrders: Record<string, string[]>;
  wingOrder: string[];
} {
  const ui = fiddle.ui as Record<string, unknown> | undefined;
  const menus = ui?.menus as Record<string, unknown> | undefined;
  const standardMenus = menus?.standard_menus as Record<string, unknown> | undefined;
  const museum = standardMenus?.museum as Record<string, unknown> | undefined;
  if (!museum) return { setOrders: {}, wingOrder: [] };

  const sourceFile = sourceFileFor(fiddle, "ui.menus.standard_menus.museum");

  // Wings: now a real array of { wing: string, ... }
  const rawWings = expectArray<Record<string, unknown>>(museum.wings, {
    fieldPath: "museum.wings",
    sourcePath: sourceFile,
  });
  const wingOrder: string[] = [];
  for (const entry of rawWings) {
    const wingId = entry.wing;
    if (typeof wingId !== "string") {
      throw new Error(`museum.wings entry lacks string wing in ${sourceFile}`);
    }
    wingOrder.push(wingId);
  }

  // Set orders: now real string arrays
  const setOrders: Record<string, string[]> = {};
  for (const wingId of wingOrder) {
    const orderKey = `${wingId}_order`;
    const rawOrder = museum[orderKey];
    setOrders[wingId] = expectStringArray(rawOrder, {
      entityId: wingId,
      fieldPath: orderKey,
      sourcePath: sourceFile,
    });
  }

  return { setOrders, wingOrder };
}
