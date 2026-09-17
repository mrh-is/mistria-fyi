import { trackerData } from "$lib/data/index.js";
import { getNameTable } from "$lib/data/names.js";
import { recordMap } from "$lib/utils";

import type { LocaleCode } from "$lib/types/locale.js";
import type { QuestType, SkillId, StoreId } from "$lib/types/tracker-data";
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
  redactedStoreIds: ReadonlySet<StoreId>,
  locale: LocaleCode,
): Omit<SegmentLookups, "entityVisibility"> {
  return {
    ...staticBaseSegmentLookups,
    npcNames: getNameTable("npcs", locale),
    redactedStoreIds,
    skillNames: getNameTable("skills", locale),
  };
}

const staticBaseSegmentLookups = buildStaticBaseSegmentLookups();

function buildStaticBaseSegmentLookups(): Omit<
  SegmentLookups,
  "entityVisibility" | "npcNames" | "redactedStoreIds" | "skillNames"
> {
  const perks = Object.fromEntries(
    Object.entries(trackerData.skills).flatMap(([skillId, skill]) =>
      skill.perkTiers.flatMap((tier, tierIndex) =>
        Object.entries(tier).map(([perkId, perk]) => [
          perkId,
          { name: perk.name, skillId: skillId as SkillId, tier: tierIndex + 1 },
        ]),
      ),
    ),
  );

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
    npcVisibility: recordMap(trackerData.npcs, ({ visibility }) => visibility),
    perks,
    perkTierLevels: trackerData.perkTierLevels,
    questNames: Object.fromEntries(
      Object.values(trackerData.quests).flatMap((group) =>
        Object.entries(group).map(([id, quest]) => [id, quest.name]),
      ),
    ),
    questNpcIds: recordMap(trackerData.quests.fetch, ({ npc }) => npc),
    questTypes: Object.fromEntries(
      (Object.entries(trackerData.quests) as [QuestType, Record<string, unknown>][]).flatMap(
        ([questType, group]) => Object.keys(group).map((id) => [id, questType]),
      ),
    ),
    recipeNames: recordMap(trackerData.recipes, ({ name }) => name),
    stationNames: {},
    stores: trackerData.stores,
    storeVisibility: recordMap(trackerData.stores, ({ visibility }) => visibility),
    treasureChestTiers: trackerData.treasureChestTiers,
  };
}
