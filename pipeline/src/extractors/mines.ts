import { expectArray } from "../data-shapes.js";
import { type ParsedGameData, sourceFileFor } from "../parse-fiddle.js";

import type { MinesBiomeId, SpellId, TrackerData } from "$lib/types/tracker-data.js";

/**
 * Projects dungeon biomes and spells. Biome IDs are synthetic array indices; each end floor is the
 * floor before the next biome starts, and missing starts use 20-floor spacing.
 */
export function extractMines(fiddle: ParsedGameData): TrackerData["mines"] {
  const dungeons = fiddle.dungeons as Record<string, unknown> | undefined;
  const spellsData = fiddle.spells as Record<string, Record<string, unknown>> | undefined;

  const dungeonsInner = dungeons?.dungeons as Record<string, unknown> | undefined;
  const misc = dungeons?.misc as Record<string, unknown> | undefined;
  const maxFloors = misc?.max_floors as number | undefined;
  if (typeof maxFloors !== "number") {
    throw new Error("Missing numeric dungeons.misc.max_floors");
  }

  const sourceFile = sourceFileFor(fiddle, "dungeons.dungeons.biomes");
  const rawBiomes = expectArray<Record<string, unknown>>(dungeonsInner?.biomes, {
    fieldPath: "dungeons.biomes",
    sourcePath: sourceFile,
  });

  const biomes = rawBiomes.map((b, i) => ({
    endFloor:
      i + 1 < rawBiomes.length
        ? ((rawBiomes[i + 1].floor as number | undefined) ?? (i + 1) * 20 + 1) - 1
        : maxFloors,
    id: `biome_${i}` as MinesBiomeId,
    name: (b.name as string | undefined) ?? `Biome ${i + 1}`,
    startFloor: (b.floor as number | undefined) ?? i * 20 + 1,
  }));

  const spells = {} as Record<SpellId, { name: string }>;
  if (spellsData) {
    for (const [id, spell] of Object.entries(spellsData)) {
      if (id === "default") continue;
      spells[id as SpellId] = {
        name: (spell.name as string | undefined) ?? id,
      };
    }
  }

  console.log(
    `  Mines: ${biomes.length} biomes, ${maxFloors} max floors, ${Object.keys(spells).length} spells`,
  );
  return { biomes, maxFloors, spells };
}
