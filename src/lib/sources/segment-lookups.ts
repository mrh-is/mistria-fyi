import { trackerData } from "#lib/data/index.js";
import { getName, getNameTable } from "#lib/data/names.js";
import {
  buildAnimalNames,
  buildLocationNames,
  buildMonsterNames,
  buildUnnamedSourceNames,
  buildWaterNames,
  UNNAMED_SOURCE_IDS,
} from "#lib/sources/source-names.js";
import { recordEntries, recordKeys, recordMap } from "#lib/utils/record.js";

import type { NameChunk } from "#lib/data/names.js";
import type { SegmentLookups } from "#lib/sources/source-segments.js";
import type { LocaleCode } from "#lib/types/locale.js";
import type { QuestType, StoreId } from "#lib/types/tracker-data.js";

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
export const SEGMENT_LOOKUP_NAME_CHUNKS = [
  "animals",
  "festivals",
  "items",
  "locations",
  "mines",
  "monsters",
  "museum_wings",
  "villagers",
  "perks",
  "pets/skins",
  "quests",
  "recipes",
  "skills",
  "stores",
  "treasure-chest-tiers",
] as const satisfies readonly NameChunk[];

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
    festivals: Object.fromEntries(
      recordEntries(trackerData.festivals).map(([id, festival]) => [
        id,
        { ...festival, name: getName("festivals", id, locale) },
      ]),
    ),
    itemNames,
    locationNames: buildLocationNames(locale),
    monsterNames: buildMonsterNames(locale),
    museumWingNames: getNameTable("museum_wings", locale),
    perks: Object.fromEntries(
      recordEntries(trackerData.skills).flatMap(([skillId, skill]) =>
        skill.perkTiers.flatMap((tier, tierIndex) =>
          recordKeys(tier).map((perkId) => [
            perkId,
            {
              name: getName("perks", perkId, locale),
              skillId,
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
          recordKeys(group).map((id) => [id, getName("quests", id, locale)]),
        ),
      ),
    },
    recipeNames: getNameTable("recipes", locale),
    // Processing stations are items.
    stationNames: itemNames,
    stores: Object.fromEntries(
      recordEntries(trackerData.stores).map(([id, store]) => [
        id,
        { ...store, name: getName("stores", id, locale) },
      ]),
    ),
    treasureChestTiers: {
      ...recordMap(buildUnnamedSourceNames(UNNAMED_SOURCE_IDS.treasureChestTiers), (name) => ({
        name,
      })),
      ...Object.fromEntries(
        recordKeys(trackerData.treasureChestTiers).map((id) => [
          id,
          { name: getName("treasure-chest-tiers", id, locale) },
        ]),
      ),
    },
    waterNames: buildWaterNames(locale),
  };
  localizedBaseSegmentLookups.set(locale, lookups);
  return lookups;
}
