import { trackerData } from "#lib/data/index.js";
import { getMarriedVillager } from "#lib/engine/relationships.js";

import type { CompletedState } from "#lib/stores/user-state.svelte.js";
import type { Source } from "#lib/types/acquisition.js";
import type { ItemId, VillagerId, VillagerRelationship } from "#lib/types/tracker-data.js";

export function isItemApplicable(itemId: ItemId, completed: CompletedState): boolean {
  if (completed.almanac.has(itemId) || completed.museum.has(itemId)) return true;

  const item = trackerData.items[itemId];

  const hasMarriageExclusiveSource = item.sources.some(
    (s) => s.type === "proposal" || s.type === "spouseGift",
  );
  if (!hasMarriageExclusiveSource) return true;

  const marriedVillager = getMarriedVillager(completed.villagerRelationships);
  return item.sources.some(
    (s) => !isSourceSuppressed(s, completed.villagerRelationships, marriedVillager),
  );
}

export function isItemApplicableForAlmanac(itemIds: ItemId[], completed: CompletedState): boolean {
  if (itemIds.some((id) => completed.almanac.has(id))) return true;

  return itemIds.some((id) => isItemApplicable(id, completed));
}

function isSourceSuppressed(
  source: Source,
  villagerRelationships: Partial<Record<VillagerId, VillagerRelationship>>,
  marriedVillager: null | VillagerId,
): boolean {
  if (source.type === "proposal") {
    return villagerRelationships[source.villagerId] === "platonic";
  }
  if (source.type === "spouseGift") {
    if (villagerRelationships[source.villagerId] === "platonic") return true;
    if (marriedVillager !== null && marriedVillager !== source.villagerId) return true;
    return false;
  }
  return false;
}
