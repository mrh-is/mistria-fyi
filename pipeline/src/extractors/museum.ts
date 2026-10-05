import { LOCALE_CODES } from "#lib/types/locale.js";

import { expectArray, expectStringArray } from "../data-shapes.js";
import { localizeField } from "../localize.js";
import { sourceFileFor } from "../parse-fiddle.js";

import type { LocaleCode } from "#lib/types/locale.js";
import type {
  ItemId,
  MuseumWing,
  MuseumWingId,
  MuseumWingSet,
  MuseumWingSetId,
  TrackerData,
} from "#lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle.js";

/**
 * Projects museum wings and sets in the canonical UI display order. Object insertion order is only
 * a fallback when UI ordering is unavailable; ordered wing and set IDs absent from game data are skipped.
 */
export function extractMuseum(
  fiddle: ParsedGameData,
  assetsDir: string,
): { localeNames: Record<LocaleCode, Record<string, string>>; museum: TrackerData["museum"] } {
  const localeNames = Object.fromEntries(LOCALE_CODES.map((locale) => [locale, {}])) as Record<
    LocaleCode,
    Record<string, string>
  >;
  const wings = fiddle.museum_wings as Record<string, Record<string, unknown>> | undefined;
  if (!wings) return { localeNames, museum: {} };

  const { setOrders, wingOrder } = readMuseumOrdering(fiddle);
  const orderedWingIds = wingOrder.length > 0 ? wingOrder : Object.keys(wings);

  const result: Record<MuseumWingId, MuseumWing> = {};

  for (const wingId of orderedWingIds) {
    const wing = wings[wingId] as Record<string, unknown> | undefined;
    if (!wing) continue;

    const rawSets = wing.sets as Record<string, Record<string, unknown>> | undefined;
    if (!rawSets) continue;

    const setOrder = setOrders[wingId];
    const orderedSetIds = setOrder && setOrder.length > 0 ? setOrder : Object.keys(rawSets);

    const sourceFile = sourceFileFor(fiddle, `museum_wings.${wingId}`);

    const sets: Record<MuseumWingSetId, MuseumWingSet> = {};
    for (const setId of orderedSetIds) {
      const set = rawSets[setId] as Record<string, unknown> | undefined;
      if (!set) continue;

      const items = expectStringArray(set.items, {
        entityId: `${wingId}.${setId}`,
        fieldPath: "items",
        sourcePath: sourceFile,
      });

      sets[setId as MuseumWingSetId] = { items: items as ItemId[] };
      const name = (set.name as string | undefined) ?? setId;
      const key = `${wingId}/sets/${setId}`;
      const { values } = localizeField(assetsDir, {
        category: `museum_wings/${wingId}/sets`,
        classification: "localizable",
        englishValue: name,
        field: "name",
        id: setId,
      });
      for (const locale of LOCALE_CODES) localeNames[locale][key] = values[locale];
    }

    result[wingId as MuseumWingId] = { sets };
    const name = (wing.name as string | undefined) ?? wingId;
    const { values } = localizeField(assetsDir, {
      category: "museum_wings",
      classification: "localizable",
      englishValue: name,
      field: "name",
      id: wingId,
    });
    for (const locale of LOCALE_CODES) localeNames[locale][wingId] = values[locale];
  }

  const totalSets = Object.values(result).reduce((n, w) => n + Object.keys(w.sets).length, 0);
  const totalItems = Object.values(result).reduce(
    (n, w) => n + Object.values(w.sets).reduce((m, s) => m + s.items.length, 0),
    0,
  );
  console.log(
    `  Museum: ${Object.keys(result).length} wings, ${totalSets} sets, ${totalItems} items`,
  );
  return { localeNames, museum: result };
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

  const rawWings = expectArray<Record<string, unknown>>(museum.wings, {
    fieldPath: "museum.wings",
    sourcePath: sourceFile,
  });
  const wingOrder: string[] = [];
  for (const entry of rawWings) {
    const wingId = entry.wing;
    if (typeof wingId !== "string") {
      throw new TypeError(`museum.wings entry lacks string wing in ${sourceFile}`);
    }
    wingOrder.push(wingId);
  }

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
