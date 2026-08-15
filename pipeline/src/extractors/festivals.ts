import type { FestivalId, Season } from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle.js";

export function extractFestivals(
  fiddle: ParsedGameData,
): Record<FestivalId, { date: { day: number; season: Season }; name: string }> {
  const festivals = fiddle.festivals as Record<string, unknown> | undefined;
  if (!festivals) return {};

  const result = {} as Record<FestivalId, { date: { day: number; season: Season }; name: string }>;
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

    result[festivalId as FestivalId] = {
      date: { day, season: season as Season },
      name,
    };
  }

  console.log(`  Festivals: ${Object.keys(result).length}`);
  return result;
}
