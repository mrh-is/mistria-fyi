import { expectArray } from "../data-shapes.js";
import { type ParsedGameData, sourceFileFor } from "../parse-fiddle.js";

import type { SourceTuple } from "$lib/types/acquisition.js";
import type {
  MinesBiome,
  MinesBiomeId,
  Spell,
  SpellId,
  TrackerData,
} from "$lib/types/tracker-data.js";

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

  const biomes: MinesBiome[] = rawBiomes.map((b, i) => {
    const name = (b.name as string | undefined) ?? `Biome ${i + 1}`;
    const start = (b.floor as number | undefined) ?? i * 20 + 1;
    const end =
      i + 1 < rawBiomes.length
        ? ((rawBiomes[i + 1].floor as number | undefined) ?? (i + 1) * 20 + 1) - 1
        : maxFloors;
    return {
      floors: { start, end },
      id: nameToId(name),
      name,
    };
  });

  const spells = {} as Record<SpellId, Spell>;
  if (spellsData) {
    for (const [id, spell] of Object.entries(spellsData)) {
      if (id === "default") continue;
      spells[id as SpellId] = {
        name: (spell.name as string | undefined) ?? id,
        sources: [] as unknown as SourceTuple,
      };
    }
  }

  const lastBiome = biomes[biomes.length - 1];
  console.log(
    `  Mines: ${biomes.length} biomes, ${lastBiome?.floors.end ?? 0} max floors, ${Object.keys(spells).length} spells`,
  );
  return { biomes, spells };
}

function nameToId(name: string): MinesBiomeId {
  return name
    .replace(/^The\s+/i, "")
    .toLowerCase()
    .replace(/\s+/g, "_") as MinesBiomeId;
}
