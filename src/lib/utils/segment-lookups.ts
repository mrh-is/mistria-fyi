import { trackerData } from "$lib/data/index.js";
import { getName, getNameTable } from "$lib/data/names.js";
import { recordMap } from "$lib/utils";
import {
  buildAnimalNames,
  buildBundleNames,
  buildLocationNames,
  buildMonsterNames,
  buildUnnamedSourceNames,
  buildWaterNames,
  UNNAMED_SOURCE_IDS,
} from "$lib/utils/source-names.js";

import type { LocalizedCategory } from "$lib/data/names.js";
import type { LocaleCode } from "$lib/types/locale.js";
import type { QuestType, SkillId, StoreId } from "$lib/types/tracker-data";
import type { SegmentLookups } from "$lib/utils/source-segments.js";

/**
 * Builds the shared portion of a `SegmentLookups` object from `trackerData`.
 * Every content page needs the same reference tables (items, quests, villagers, stores,
 * perks, festivals, biomes, treasure chests, & visibility maps); only `entityVisibility`
 * varies per row, since it reflects the entity currently being rendered.
 *
 * Location, monster, & water names have no game-translated table the pipeline extracts yet;
 * `source-names.ts` covers them with interim translations.
 */
export function buildBaseSegmentLookups(
  redactedStoreIds: ReadonlySet<StoreId>,
  locale: LocaleCode,
): Omit<SegmentLookups, "entityVisibility"> {
  return {
    ...staticBaseSegmentLookups,
    ...getLocalizedBaseSegmentLookups(locale),
    locale,
    redactedStoreIds,
    seasonNames: {
      fall: getName("ui", "fall", locale),
      spring: getName("ui", "spring", locale),
      summer: getName("ui", "summer", locale),
      winter: getName("ui", "winter", locale),
    },
    skillNames: getNameTable("skills", locale),
    villagerNames: getNameTable("villagers", locale),
  };
}

const staticBaseSegmentLookups = buildStaticBaseSegmentLookups();
const localizedBaseSegmentLookups = new Map<LocaleCode, Pick<SegmentLookups, LocalizedLookupKey>>();

type LocalizedLookupKey =
  | "animalNames"
  | "biomes"
  | "bundleNames"
  | "festivals"
  | "itemNames"
  | "locationNames"
  | "monsterNames"
  | "museumWingNames"
  | "perks"
  | "questNames"
  | "recipeNames"
  | "stationNames"
  | "stores"
  | "treasureChestTiers"
  | "waterNames";

function buildStaticBaseSegmentLookups(): Omit<
  SegmentLookups,
  | "entityVisibility"
  | "locale"
  | "redactedStoreIds"
  | "seasonNames"
  | "skillNames"
  | "villagerNames"
  | LocalizedLookupKey
> {
  return {
    categoryVisibility: trackerData.categoryVisibility,
    itemVisibility: Object.fromEntries(
      Object.entries(trackerData.items)
        .filter(([, item]) => item.visibility)
        .map(([id, item]) => [id, item.visibility]),
    ),
    perkTierLevels: trackerData.perkTierLevels,
    questTypes: Object.fromEntries(
      (Object.entries(trackerData.quests) as [QuestType, Record<string, unknown>][]).flatMap(
        ([questType, group]) => Object.keys(group).map((id) => [id, questType]),
      ),
    ),
    questVillagerIds: recordMap(trackerData.quests.fetch, ({ villager }) => villager),
    storeVisibility: recordMap(trackerData.stores, ({ visibility }) => visibility),
    villagerVisibility: recordMap(trackerData.villagers, ({ visibility }) => visibility),
  };
}

/**
 * Every name category {@link buildBaseSegmentLookups} resolves. A route whose page renders source
 * segments must await these (see `localizedPageLoad`) alongside its own category's chunk.
 */
export const SEGMENT_LOOKUP_CATEGORIES = [
  "animals",
  "festivals",
  "items",
  "mines",
  "museum_wings",
  "villagers",
  "perks",
  "pets/skins",
  "quests",
  "recipes",
  "skills",
  "stores",
  "treasure-chest-tiers",
] as const satisfies readonly LocalizedCategory[];

function getLocalizedBaseSegmentLookups(
  locale: LocaleCode,
): Pick<SegmentLookups, LocalizedLookupKey> {
  const cached = localizedBaseSegmentLookups.get(locale);
  if (cached) return cached;

  const itemNames = getNameTable("items", locale);
  const lookups = {
    animalNames: buildAnimalNames(locale),
    biomes: trackerData.mines.biomes.map((biome) => ({
      ...biome,
      name: getName("mines", biome.id, locale),
    })),
    bundleNames: buildBundleNames(locale),
    festivals: Object.fromEntries(
      Object.entries(trackerData.festivals).map(([id, festival]) => [
        id,
        { ...festival, name: getName("festivals", id as never, locale) },
      ]),
    ),
    itemNames,
    locationNames: buildLocationNames(locale),
    monsterNames: buildMonsterNames(locale),
    museumWingNames: getNameTable("museum_wings", locale),
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
    questNames: {
      ...buildUnnamedSourceNames(UNNAMED_SOURCE_IDS.quests),
      ...Object.fromEntries(
        Object.values(trackerData.quests).flatMap((group) =>
          Object.keys(group).map((id) => [id, getName("quests", id as never, locale)]),
        ),
      ),
    },
    recipeNames: getNameTable("recipes", locale),
    // Processing stations are items.
    stationNames: itemNames,
    stores: Object.fromEntries(
      Object.entries(trackerData.stores).map(([id, store]) => [
        id,
        { ...store, name: getName("stores", id as never, locale) },
      ]),
    ),
    treasureChestTiers: {
      ...recordMap(buildUnnamedSourceNames(UNNAMED_SOURCE_IDS.treasureChestTiers), (name) => ({
        name,
      })),
      ...Object.fromEntries(
        Object.keys(trackerData.treasureChestTiers).map((id) => [
          id,
          { name: getName("treasure-chest-tiers", id as never, locale) },
        ]),
      ),
    },
    waterNames: buildWaterNames(locale),
  };
  localizedBaseSegmentLookups.set(locale, lookups);
  return lookups;
}
