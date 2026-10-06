import { LOCALE_CODES } from "#lib/types/locale.js";
import { SEASONS } from "#lib/types/tracker-data.js";

import { compareStrings } from "../ordering.js";

import type { LocaleCode } from "#lib/types/locale.js";
import type { FestivalId, Season, TrackerData } from "#lib/types/tracker-data.js";

import type { Localizer } from "../localize.js";
import type { ParsedGameData } from "../parse-fiddle.js";

const VALID_SEASONS = new Set<string>(SEASONS);

export function extractFestivals(
  fiddle: ParsedGameData,
  localizer: Localizer,
): {
  festivals: TrackerData["festivals"];
  localeNames: Record<LocaleCode, Record<FestivalId, string>>;
} {
  const localeNames = Object.fromEntries(LOCALE_CODES.map((locale) => [locale, {}])) as Record<
    LocaleCode,
    Record<FestivalId, string>
  >;
  const festivals = fiddle.festivals as Record<string, unknown> | undefined;
  if (!festivals) return { festivals: {}, localeNames };

  const result = {} as TrackerData["festivals"];
  for (const festivalId of Object.keys(festivals).toSorted(compareStrings)) {
    if (festivalId === "default") continue;

    const festival = festivals[festivalId];
    if (typeof festival !== "object" || festival === null) continue;

    const name = (festival as Record<string, unknown>).name;
    if (typeof name !== "string") continue;

    const dateObj = (festival as Record<string, unknown>).date;
    if (typeof dateObj !== "object" || dateObj === null || Array.isArray(dateObj)) {
      throw new Error(`Festival "${festivalId}" has no valid date`);
    }
    const { day, season } = dateObj as Record<string, unknown>;
    if (
      typeof day !== "number" ||
      !Number.isInteger(day) ||
      day < 1 ||
      day > 28 ||
      typeof season !== "string" ||
      !VALID_SEASONS.has(season)
    ) {
      throw new Error(`Festival "${festivalId}" has no valid date`);
    }

    result[festivalId as FestivalId] = { date: { day, season: season as Season } };
    const { values } = localizer.localizeField({
      category: "festivals",
      classification: "localizable",
      englishValue: name,
      field: "name",
      id: festivalId,
    });
    for (const locale of LOCALE_CODES) {
      localeNames[locale][festivalId as FestivalId] = values[locale];
    }
  }

  console.log(`  Festivals: ${Object.keys(result).length}`);
  return { festivals: result, localeNames };
}
