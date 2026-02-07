import type { NpcId, Season, TrackerData } from "$lib/types/tracker-data.js";

import type { FiddleData } from "../parse-fiddle.js";

export function extractNpcs(fiddle: FiddleData): TrackerData["npcs"] {
  const npcs = fiddle.npcs as Record<string, Record<string, unknown>> | undefined;
  if (!npcs) return {} as TrackerData["npcs"];

  const result = {} as Record<NpcId, TrackerData["npcs"][NpcId]>;
  for (const [id, npc] of Object.entries(npcs)) {
    if (id === "default") continue;

    const birthday = npc.birthday as undefined | { day?: number; season?: string };

    result[id as NpcId] = {
      birthday: {
        day: birthday?.day ?? 1,
        season: (birthday?.season as Season) ?? "spring",
      },
      dateable: (npc.dateable as boolean | undefined) ?? false,
      name: (npc.name as string | undefined) ?? id,
    };
  }

  console.log(`  NPCs: ${Object.keys(result).length}`);
  return result;
}
