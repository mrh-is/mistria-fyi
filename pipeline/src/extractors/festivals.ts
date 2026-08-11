import type { FestivalId } from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle.js";

export function extractFestivals(fiddle: ParsedGameData): Record<FestivalId, { name: string }> {
  const festivals = fiddle.festivals as Record<string, unknown> | undefined;
  if (!festivals) return {};

  const result = {} as Record<FestivalId, { name: string }>;
  for (const festivalId of Object.keys(festivals).sort()) {
    if (festivalId === "default") continue;

    const festival = festivals[festivalId];
    if (typeof festival !== "object" || festival === null) continue;

    const name = (festival as Record<string, unknown>).name;
    if (typeof name !== "string") continue;

    result[festivalId as FestivalId] = { name };
  }

  console.log(`  Festivals: ${Object.keys(result).length}`);
  return result;
}
