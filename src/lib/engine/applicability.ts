import { trackerData } from "#lib/data/index.js";
import { getPartnerId } from "#lib/engine/relationships.js";

import type { Source } from "#lib/types/acquisition.js";
import type { ItemId, VillagerId, VillagerRelationship } from "#lib/types/tracker-data.js";
import type { ProgressState } from "#lib/types/user-progress.js";
import type { DeepReadonly } from "#lib/utils/deep-readonly.js";

export function isItemObtainable(itemId: ItemId, completed: DeepReadonly<ProgressState>): boolean {
  if (completed.almanac.has(itemId) || completed.museum.has(itemId)) return true;

  const item = trackerData.items[itemId];

  const hasMarriageExclusiveSource = item.sources.some(
    (s) => s.type === "proposal" || s.type === "spouseGift",
  );
  if (!hasMarriageExclusiveSource) return true;

  const partnerVillager = getPartnerId(completed.villagerRelationships);
  return item.sources.some(
    (s) => !isSourceSuppressed(s, completed.villagerRelationships, partnerVillager),
  );
}

export function isAlmanacEntryObtainable(
  itemIds: ItemId[],
  completed: DeepReadonly<ProgressState>,
): boolean {
  if (itemIds.some((id) => completed.almanac.has(id))) return true;

  return itemIds.some((id) => isItemObtainable(id, completed));
}

function isSourceSuppressed(
  source: Source,
  villagerRelationships: Partial<Record<VillagerId, VillagerRelationship>>,
  partnerVillager: null | VillagerId,
): boolean {
  if (source.type === "proposal") {
    return (
      villagerRelationships[source.villagerId] === "platonic" ||
      (partnerVillager !== null && partnerVillager !== source.villagerId)
    );
  }
  if (source.type === "spouseGift") {
    if (villagerRelationships[source.villagerId] === "platonic") return true;
    if (partnerVillager !== null && partnerVillager !== source.villagerId) return true;
    return false;
  }
  return false;
}
