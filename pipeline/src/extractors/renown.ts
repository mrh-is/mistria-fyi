import { expectArray } from "../data-shapes.js";
import { type ParsedGameData, sourceFileFor } from "../parse-fiddle.js";

import type { TrackerData } from "$lib/types/tracker-data.js";

export function extractTownRanks(fiddle: ParsedGameData): TrackerData["townRanks"] {
  const renown = fiddle.renown as Record<string, unknown> | undefined;
  if (!renown) return [];

  const levelsPerRank = (renown.levels_per_rank as number | undefined) ?? 10;

  const sourceFile = sourceFileFor(fiddle, "renown");
  const rawRanks = expectArray<Record<string, unknown>>(renown.ranks, {
    fieldPath: "renown.ranks",
    sourcePath: sourceFile,
  });

  // The game uses N-1 full ranks + 1 cap rank at the ceiling level
  const maxLevel = (rawRanks.length - 1) * levelsPerRank;
  const townRanks: TrackerData["townRanks"] = rawRanks.map((r, i) => {
    return {
      levels: {
        start: i * levelsPerRank,
        end: Math.min((i + 1) * levelsPerRank - 1, maxLevel),
      },
      name: (r.name as string | undefined) ?? "Unknown",
    };
  });

  console.log(`  Town ranks: ${townRanks.length} ranks, ${levelsPerRank} levels per rank`);
  return townRanks;
}
