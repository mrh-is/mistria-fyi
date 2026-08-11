import type { NpcId, Season, TrackerData } from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle.js";

/**
 * Includes only complete NPC tracker records. Missing names, non-Boolean dateable values, and
 * incomplete birthdays silently exclude the source record.
 */
export function extractNpcs(fiddle: ParsedGameData): TrackerData["npcs"] {
  const npcs = fiddle.npcs as Record<string, Record<string, unknown>> | undefined;
  if (!npcs) return {} as TrackerData["npcs"];

  const result = {} as Record<NpcId, TrackerData["npcs"][NpcId]>;
  for (const [id, npc] of Object.entries(npcs)) {
    if (id === "default") continue;

    const name = npc.name as string | undefined;
    if (!name) continue;

    const birthday = npc.birthday as undefined | { day?: number; season?: string };
    const dateable = npc.dateable;

    if (typeof dateable !== "boolean") continue;
    if (!birthday?.season || typeof birthday.day !== "number") continue;

    result[id as NpcId] = {
      birthday: {
        day: birthday.day,
        season: birthday.season as Season,
      },
      dateable,
      name,
    };
  }

  console.log(`  NPCs: ${Object.keys(result).length}`);
  return result;
}
