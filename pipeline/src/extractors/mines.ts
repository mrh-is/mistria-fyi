import type { BiomeId, SpellId, TrackerData } from "$lib/types/tracker-data.js";

import type { FiddleData } from "../parse-fiddle.js";

export function extractMines(fiddle: FiddleData): TrackerData["mines"] {
  const dungeons = fiddle.dungeons as Record<string, unknown> | undefined;
  const spellsData = fiddle.spells as Record<string, Record<string, unknown>> | undefined;

  // Extract biomes
  const dungeonsInner = dungeons?.dungeons as Record<string, unknown> | undefined;
  const rawBiomes = toArray(dungeonsInner?.biomes);
  const misc = dungeons?.misc as Record<string, unknown> | undefined;
  const maxFloors = (misc?.max_floors as number | undefined) ?? 99;

  const biomes = rawBiomes.map((b, i) => ({
    endFloor:
      i + 1 < rawBiomes.length
        ? ((rawBiomes[i + 1].floor as number | undefined) ?? (i + 1) * 20 + 1) - 1
        : maxFloors,
    id: `biome_${i}` as BiomeId,
    name: (b.name as string | undefined) ?? `Biome ${i + 1}`,
    startFloor: (b.floor as number | undefined) ?? i * 20 + 1,
  }));

  // Extract spells
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

/** Convert array or numbered-key object to array of entries. */
function toArray(data: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    return Object.keys(data)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => (data as Record<string, unknown>)[k] as Record<string, unknown>)
      .filter((v) => v && typeof v === "object");
  }
  return [];
}
