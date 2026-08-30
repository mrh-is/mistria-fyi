import { trackerData } from "$lib/data/index.js";

import type { NpcId, NpcRelationship } from "$lib/types/tracker-data.js";

export function getMarriedNpc(
  npcRelationships: Partial<Record<NpcId, NpcRelationship>>,
): NpcId | null {
  for (const [npcId, rel] of Object.entries(npcRelationships)) {
    if (rel === "married") return npcId as NpcId;
  }
  return null;
}

export function isRomantic(
  npcRelationships: Partial<Record<NpcId, NpcRelationship>>,
  npcId: NpcId,
): boolean {
  const rel = npcRelationships[npcId];
  return rel === "romantic" || rel === "proposed" || rel === "married";
}

export function normalizeRelationships(
  npcRelationships: Partial<Record<NpcId, NpcRelationship>>,
): void {
  const marriedNpc = getMarriedNpc(npcRelationships);
  if (!marriedNpc) return;

  for (const [npcId, rel] of Object.entries(npcRelationships)) {
    if (npcId !== marriedNpc && rel !== "platonic") {
      npcRelationships[npcId as NpcId] = "platonic";
    }
  }

  const dateableNpcs = Object.entries(trackerData.npcs)
    .filter(([, npc]) => npc.dateable)
    .map(([id]) => id as NpcId);
  for (const npcId of dateableNpcs) {
    if (npcId !== marriedNpc && !(npcId in npcRelationships)) {
      npcRelationships[npcId] = "platonic";
    }
  }
}
