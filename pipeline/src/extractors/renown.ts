import type { TrackerData } from "$lib/types/tracker-data.js";

import type { FiddleData } from "../parse-fiddle.js";

export function extractRenown(fiddle: FiddleData): TrackerData["renown"] {
  const renown = fiddle.renown as Record<string, unknown> | undefined;
  if (!renown) return { levelsPerRank: 10, ranks: [] };

  const levelsPerRank = (renown.levels_per_rank as number | undefined) ?? 10;

  // Ranks come as a numbered-key object { "0": {...}, "1": {...} } from the parser
  // (because the flat keys are renown/ranks/0/name, renown/ranks/1/name, etc.)
  const rawRanks = renown.ranks as
    | Record<string, Record<string, unknown>>
    | Record<string, unknown>[]
    | undefined;

  const ranks: { name: string }[] = [];
  if (Array.isArray(rawRanks)) {
    for (const r of rawRanks) {
      ranks.push({ name: (r.name as string | undefined) ?? "Unknown" });
    }
  } else if (rawRanks && typeof rawRanks === "object") {
    // Numbered keys — sort numerically and extract
    const sortedKeys = Object.keys(rawRanks).sort((a, b) => Number(a) - Number(b));
    for (const key of sortedKeys) {
      const r = rawRanks[key];
      if (r && typeof r === "object") {
        ranks.push({ name: (r.name as string | undefined) ?? "Unknown" });
      }
    }
  }

  console.log(`  Renown: ${ranks.length} ranks, ${levelsPerRank} levels per rank`);
  return { levelsPerRank, ranks };
}
