import { trackerData } from "$lib/data/index.js";
import { getName, getNameTable } from "$lib/data/names.js";
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
    ...getLocalizedBaseSegmentLookups(locale),
    npcNames: getNameTable("npcs", locale),
    redactedStoreIds,
    skillNames: getNameTable("skills", locale),
  };
}

const staticBaseSegmentLookups = buildStaticBaseSegmentLookups();
const localizedBaseSegmentLookups = new Map<
  LocaleCode,
  Pick<SegmentLookups, "biomes" | "festivals" | "perks" | "questNames" | "stores">
>();

function buildStaticBaseSegmentLookups(): Omit<
  SegmentLookups,
  | "biomes"
  | "entityVisibility"
  | "festivals"
  | "npcNames"
  | "perks"
  | "questNames"
  | "redactedStoreIds"
  | "skillNames"
  | "stores"
> {
  return {
    animalNames: {},
    categoryVisibility: trackerData.categoryVisibility,
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
    perkTierLevels: trackerData.perkTierLevels,
    questNpcIds: recordMap(trackerData.quests.fetch, ({ npc }) => npc),
    questTypes: Object.fromEntries(
      (Object.entries(trackerData.quests) as [QuestType, Record<string, unknown>][]).flatMap(
        ([questType, group]) => Object.keys(group).map((id) => [id, questType]),
      ),
    ),
    recipeNames: recordMap(trackerData.recipes, ({ name }) => name),
    stationNames: {},
    storeVisibility: recordMap(trackerData.stores, ({ visibility }) => visibility),
    treasureChestTiers: trackerData.treasureChestTiers,
  };
}

function getLocalizedBaseSegmentLookups(
  locale: LocaleCode,
): Pick<SegmentLookups, "biomes" | "festivals" | "perks" | "questNames" | "stores"> {
  const cached = localizedBaseSegmentLookups.get(locale);
  if (cached) return cached;

  const lookups = {
    biomes: trackerData.mines.biomes.map((biome) => ({
      ...biome,
      name: getName("mines", biome.id, locale),
    })),
    festivals: Object.fromEntries(
      Object.entries(trackerData.festivals).map(([id, festival]) => [
        id,
        { ...festival, name: getName("festivals", id as never, locale) },
      ]),
    ),
    perks: Object.fromEntries(
      Object.entries(trackerData.skills).flatMap(([skillId, skill]) =>
        skill.perkTiers.flatMap((tier, tierIndex) =>
          Object.keys(tier).map((perkId) => [
            perkId,
            {
              name: getName("perks", perkId as never, locale),
              skillId: skillId as SkillId,
              tier: tierIndex + 1,
            },
          ]),
        ),
      ),
    ),
    questNames: Object.fromEntries(
      Object.values(trackerData.quests).flatMap((group) =>
        Object.keys(group).map((id) => [id, getName("quests", id as never, locale)]),
      ),
    ),
    stores: Object.fromEntries(
      Object.entries(trackerData.stores).map(([id, store]) => [
        id,
        { ...store, name: getName("stores", id as never, locale) },
      ]),
    ),
  };
  localizedBaseSegmentLookups.set(locale, lookups);
  return lookups;
}
