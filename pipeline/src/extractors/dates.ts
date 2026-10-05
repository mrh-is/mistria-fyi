import { LOCALE_CODES } from "#lib/types/locale.js";

import { forEachItem } from "../extractor-helpers.js";
import { localizeField } from "../localize.js";

import type { LocaleCode } from "#lib/types/locale.js";
import type { DateId, DateType, ItemId } from "#lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle.js";

export function extractDates(
  fiddle: ParsedGameData,
  assetsDir: string,
): { dates: Record<DateId, DateType>; localeNames: Record<LocaleCode, Record<DateId, string>> } {
  const localeNames = Object.fromEntries(LOCALE_CODES.map((locale) => [locale, {}])) as Record<
    LocaleCode,
    Record<DateId, string>
  >;
  const dates = fiddle.dates as Record<string, Record<string, unknown>> | undefined;
  if (!dates) return { dates: {}, localeNames };

  const unlockItems = buildDateUnlockMap(fiddle);

  const result = {} as Record<DateId, DateType>;

  for (const [id, date] of Object.entries(dates)) {
    if (id === "default") continue;
    if (date.unlisted === true) continue;

    const name = date.name as string | undefined;
    if (!name) {
      throw new Error(`Date "${id}" is missing a name`);
    }

    const unlockItemId = unlockItems.get(id) as ItemId;
    if (!unlockItemId) {
      throw new Error(`Date "${id}" has no matching date_unlock item in fiddle.items`);
    }

    result[id as DateId] = { sources: [{ type: "date_inspiration", itemId: unlockItemId }] };
    const { values } = localizeField(assetsDir, {
      category: "dates",
      classification: "localizable",
      englishValue: name,
      field: "name",
      id,
    });
    for (const locale of LOCALE_CODES) localeNames[locale][id as DateId] = values[locale];
  }

  console.log(`  Dates: ${Object.keys(result).length}`);
  return { dates: result, localeNames };
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
