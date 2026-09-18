import { LOCALE_CODES } from "$lib/types/locale.js";

import { localizeField } from "../localize";

import type { LocaleCode } from "$lib/types/locale.js";
import type { FestivalId, Season, TrackerData } from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle";

export function extractFestivals(
  fiddle: ParsedGameData,
  assetsDir: string,
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
  for (const festivalId of Object.keys(festivals).sort()) {
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
    const validSeasons = new Set<Season>(["fall", "spring", "summer", "winter"]);
    if (
      typeof day !== "number" ||
      !Number.isInteger(day) ||
      day < 1 ||
      day > 28 ||
      typeof season !== "string" ||
      !validSeasons.has(season as Season)
    ) {
      throw new Error(`Festival "${festivalId}" has no valid date`);
    }

    result[festivalId as FestivalId] = { date: { day, season: season as Season } };
    const { values } = localizeField(assetsDir, {
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
