import { trackerData } from "#lib/data/index.js";

import type { Source } from "#lib/types/acquisition.js";
import type { MinesBiome, TrackerData } from "#lib/types/tracker-data.js";

// A few generic drops have no confirmed spawn biome.
const monsters: Partial<TrackerData["mines"]["monsters"]> = trackerData.mines.monsters;

export function isBiomeSource(source: Source, biome: MinesBiome): boolean {
  if ("biomeId" in source) return source.biomeId === biome.id;
  if (source.type === "mine_floor") {
    return biome.floors.start <= source.floor && source.floor <= biome.floors.end;
  }
  if (source.type === "monster") {
    return monsters[source.monsterId]?.biomes.includes(biome.id) ?? false;
  }
  return false;
}
