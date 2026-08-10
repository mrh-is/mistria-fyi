import type { TrackerData } from "$lib/types/tracker-data.js";

import { expectArray } from "../data-shapes.js";
import { sourceFileFor, type FiddleData } from "../parse-fiddle.js";

export function extractRenown(fiddle: FiddleData): TrackerData["renown"] {
  const renown = fiddle.renown as Record<string, unknown> | undefined;
  if (!renown) return { levelsPerRank: 10, ranks: [] };

  const levelsPerRank = (renown.levels_per_rank as number | undefined) ?? 10;

  const sourceFile = sourceFileFor(fiddle, "renown");
  const rawRanks = expectArray<Record<string, unknown>>(renown.ranks, {
    field: "renown.ranks",
    sourceFile,
  });

  const ranks: { name: string }[] = rawRanks.map((r) => ({
    name: (r.name as string | undefined) ?? "Unknown",
  }));

  console.log(`  Renown: ${ranks.length} ranks, ${levelsPerRank} levels per rank`);
  return { levelsPerRank, ranks };
}
