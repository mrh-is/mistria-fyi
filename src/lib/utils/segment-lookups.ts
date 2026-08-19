import { trackerData } from "$lib/data/index.js";
import { recordMap } from "$lib/utils";

import type { SegmentLookups } from "$lib/utils/source-segments.js";

/**
 * Builds the shared portion of a `SegmentLookups` object from `trackerData`.
 * Every content page needs the same reference tables (items, quests, npcs, stores,
 * perks, festivals, biomes, treasure chests, & visibility maps); only `entityVisibility`
 * varies per row, since it reflects the entity currently being rendered.
 *
 * `animalNames`, `locationNames`, `monsterNames`, & `stationNames` have no dedicated
 * lookup tables in `trackerData` today, so `buildSourceSegments` falls back to a
 * title-cased id for those source types.
 */
export function buildBaseSegmentLookups(
  redactedStoreIds: ReadonlySet<string>,
): Omit<SegmentLookups, "entityVisibility"> {
  return {
    animalNames: {},
    biomes: trackerData.mines.biomes,
    categoryVisibility: trackerData.categoryVisibility,
    festivals: trackerData.festivals,
    itemNames: Object.fromEntries(
      Object.entries(trackerData.items).map(([id, item]) => [id, item.name]),
    ),
    itemVisibility: Object.fromEntries(
      Object.entries(trackerData.items)
        .filter(([, item]) => item.visibility)
        .map(([id, item]) => [id, item.visibility]),
    ),
    locationNames: {},
    monsterNames: {},
    npcNames: Object.fromEntries(
      Object.entries(trackerData.npcs).map(([id, npc]) => [id, npc.name]),
    ),
    npcVisibility: trackerData.npcVisibility,
    perks: trackerData.skills,
    perkTierLevels: trackerData.perkTierLevels,
    questNames: Object.fromEntries(
      Object.values(trackerData.quests).flatMap((group) =>
        Object.entries(group).map(([id, quest]) => [id, quest.name]),
      ),
    ),
    questNpcIds: Object.fromEntries(
      Object.values(trackerData.quests).flatMap((group) =>
        Object.entries(group)
          .filter(([, q]) => q.npc)
          .map(([id, q]) => [id, q.npc]),
      ),
    ),
    recipeNames: recordMap(
      trackerData.recipes,
      (recipe, id) => recipe.presentations[0]?.name ?? id,
    ),
    redactedStoreIds,
    skillNames: recordMap(trackerData.skills, ({ name }) => name),
    stationNames: {},
    stores: trackerData.stores,
    storeVisibility: trackerData.storeVisibility,
    treasureChestTiers: trackerData.treasureChestTiers,
  };
}
