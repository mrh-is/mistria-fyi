import { trackerData } from "$lib/data/index.js";
import { getMarriedNpc } from "$lib/engine/relationships.js";

import type { CompletedState } from "$lib/stores/user-state.svelte.js";
import type { Source } from "$lib/types/acquisition.js";
import type { ItemId, NpcId, NpcRelationship } from "$lib/types/tracker-data.js";

export function isItemApplicable(itemId: ItemId, completed: CompletedState): boolean {
  if (completed.almanac.has(itemId) || completed.museum.has(itemId)) return true;

  const item = trackerData.items[itemId];

  const hasMarriageExclusiveSource = item.sources.some(
    (s) => s.type === "proposal" || s.type === "spouseGift",
  );
  if (!hasMarriageExclusiveSource) return true;

  const marriedNpc = getMarriedNpc(completed.npcRelationships);
  return item.sources.some((s) => !isSourceSuppressed(s, completed.npcRelationships, marriedNpc));
}

export function isItemApplicableForAlmanac(itemIds: ItemId[], completed: CompletedState): boolean {
  if (itemIds.some((id) => completed.almanac.has(id))) return true;

  return itemIds.some((id) => isItemApplicable(id, completed));
}

function isSourceSuppressed(
  source: Source,
  npcRelationships: Partial<Record<NpcId, NpcRelationship>>,
  marriedNpc: NpcId | null,
): boolean {
  if (source.type === "proposal") {
    return npcRelationships[source.npcId] === "platonic";
  }
  if (source.type === "spouseGift") {
    if (npcRelationships[source.npcId] === "platonic") return true;
    if (marriedNpc !== null && marriedNpc !== source.npcId) return true;
    return false;
  }
  return false;
}
