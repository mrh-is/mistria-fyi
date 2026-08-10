import type { ItemId, MuseumWing, SetId, WingId } from "$lib/types/tracker-data.js";

import { expectArray, expectStringArray } from "../data-shapes.js";
import { sourceFileFor, type FiddleData } from "../parse-fiddle.js";

export function extractMuseum(fiddle: FiddleData): MuseumWing[] {
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

    const sets: { id: SetId; items: ItemId[]; name: string }[] = [];
    for (const setId of orderedSetIds) {
      const set = rawSets[setId] as Record<string, unknown> | undefined;
      if (!set) continue;

      const items = expectStringArray(set.items, {
        entity: `${wingId}.${setId}`,
        field: "items",
        sourceFile,
      });

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

function readMuseumOrdering(fiddle: FiddleData): {
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
    field: "museum.wings",
    sourceFile,
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
      entity: wingId,
      field: orderKey,
      sourceFile,
    });
  }

  return { setOrders, wingOrder };
}
