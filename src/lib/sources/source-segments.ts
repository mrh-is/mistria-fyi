import plural from "#lib/i18n/catalogs/plural.js";
import { inLocale } from "#lib/i18n/locale-runtime.js";
import {
  formatBiomeName,
  formatStoreName,
  withIndefiniteArticle,
  withoutDefiniteArticle,
} from "#lib/utils/en-grammar.js";
import { requireBiome, requireEntry } from "#lib/utils/format.js";

import type {
  AvailabilityCondition,
  CutsceneSourceId,
  Source,
  UpgradeId,
} from "#lib/types/acquisition.js";
import type { LocaleCode } from "#lib/types/locale.js";
import type {
  CraftingStationId,
  LocationId,
  MinesBiomeId,
  PerkId,
  QuestId,
  QuestType,
  Season,
  StoreId,
  StoreUpgradeAction,
  TrackerData,
  VillagerId,
  WaterType,
} from "#lib/types/tracker-data.js";
import type { VisibilityCondition } from "#lib/types/visibility.js";
import type { BaseSegmentLookups, NameLookup } from "#lib/utils/format.js";

export type SegmentLookups = BaseSegmentLookups &
  Pick<TrackerData, "categoryVisibility"> & {
    animalNames: NameLookup<TrackerData["animals"]>;
    dateNames: NameLookup<TrackerData["dates"]>;
    entityVisibility?: VisibilityCondition;
    itemVisibility: VisibilityLookup<TrackerData["items"]>;
    /** The locale every message & name in these lookups renders in. */
    locale: LocaleCode;
    locationNames: Partial<Record<string, string>>;
    monsterNames: Partial<Record<string, string>>;
    mountNames: NameLookup<TrackerData["mount"]["appearances"]>;
    museumWingNames: Partial<Record<string, string>>;
    questTypes: Partial<Record<QuestId, QuestType>>;
    questVillagerIds: Partial<Record<QuestId, VillagerId>>;
    recipeStations: Partial<Record<keyof TrackerData["recipes"], CraftingStationId>>;
    /** The game's season names in the active locale (`ui` chunk). */
    seasonNames: Record<Season, string>;
    stationNames: Partial<Record<string, string>>;
    storeVisibility: VisibilityLookup<TrackerData["stores"]>;
    villagerNames: NameLookup<TrackerData["villagers"]>;
    villagerVisibility: VisibilityLookup<TrackerData["villagers"]>;
    waterNames: Partial<Record<string, string>>;
  };

export type SourceSegment =
  | string
  | {
      condition: VisibilityCondition;
      spoilered?: [SourceSegment, ...SourceSegment[]];
      unspoilered: [SourceSegment, ...SourceSegment[]];
    }
  | { spoilered: true };

type Segments = [SourceSegment, ...SourceSegment[]];
type Slot = SourceSegment | SourceSegment[];

/** A condition clause in both of the forms a store qualifier renders it in. */
interface StoreClause {
  /** Form inside an "after one of" list: "reaching Mines floor 20". */
  branch: string;
  /** Standalone form, appended after the store name: "after reaching Mines floor 20". */
  clause: string;
}

type VisibilityLookup<T> = Partial<Record<keyof T, VisibilityCondition>>;

const SPOILERED: SourceSegment = { spoilered: true };

type LocalizedLabel = () => string;

const CRAFTING_STATION_LABELS: Record<CraftingStationId, LocalizedLabel> = {
  blacksmithing: () => "Forge",
  dragon_forge: () => "Dragon Forge",
  kitchen: () => "Kitchen",
  mill: () => "Mill",
  stone_refinery: () => "Stone Refinery",
  woodcrafting: () => "Crafting Station",
};

const UPGRADE_MESSAGES: Record<UpgradeId, LocalizedLabel> = {
  adept_kitchen: () => "Upgrade to the adept kitchen",
  cozy_kitchen: () => "Upgrade to the cozy kitchen",
  farm_bridge: () => "Expand your farm",
  stairs: () => "Upgrade your home a fourth time",
};

/** A store's `upgradeAction`; a store without one reads as upgrading. */
const STORE_ACTION_CLAUSES: Record<StoreUpgradeAction, LocalizedLabel> = {
  repair: () => /* @wc-include */ "after repairing",
};

const SLOT_MARKER = /(\d+)/;

export function buildBiomeLabel(biomeId: MinesBiomeId, lookups: SegmentLookups): Segments {
  return inLocale(lookups.locale, () => formatBiomeLabel(biomeId, lookups));
}

function formatBiomeLabel(biomeId: MinesBiomeId, lookups: SegmentLookups): Segments {
  const biome = requireBiome(biomeId, lookups.biomes);

  const condition: VisibilityCondition = { type: "mineFloor", floor: biome.floors.start };
  const start = String(biome.floors.start);
  const end = String(biome.floors.end);

  return [
    {
      condition,
      spoilered: fillMessage(
        (slot) => `${slot(SPOILERED)} (Mines floors ${slot(SPOILERED)}–${slot(SPOILERED)})`,
      ),
      unspoilered: [
        `${formatBiomeName(biomeId, lookups.biomes, lookups.locale)} (Mines floors ${start}–${end})`,
      ],
    },
  ];
}

export function buildPerkLabel(perkId: PerkId, lookups: SegmentLookups): Segments {
  return inLocale(lookups.locale, () => formatPerkLabel(perkId, lookups));
}

function formatPerkLabel(perkId: PerkId, lookups: SegmentLookups): Segments {
  const perk = requireEntry(lookups.perks, perkId, "perks");

  const skill = requireEntry(lookups.skillNames, perk.skillId, "skillNames");
  const tier = String(perk.tier);
  const level = lookups.perkTierLevels[perk.tier - 1];
  const condition: VisibilityCondition = {
    type: "skillLevel",
    level,
    skillId: perk.skillId,
  };

  return [
    {
      condition,
      spoilered: fillMessage(
        (slot) => /* @wc-include */ `the ${slot(SPOILERED)} perk (${skill} tier ${tier})`,
      ),
      unspoilered: [/* @wc-include */ `the ${perk.name} perk (${skill} tier ${tier})`],
    },
  ];
}

export function buildSourceSegments(source: Source, lookups: SegmentLookups): Segments {
  return inLocale(lookups.locale, () => formatSourceSegments(source, lookups));
}

function formatSourceSegments(source: Source, lookups: SegmentLookups): Segments {
  const { locale } = lookups;

  switch (source.type) {
    case "animal_product": {
      const animal = requireEntry(lookups.animalNames, source.animalId, "animalNames");
      return [`Collect from ${animal}`];
    }
    case "artifact_dig": {
      const locations = buildLocationList(source.locationIds, lookups);
      return [locations ? `Dig up at ${locations}` : "Dig up at an artifact dig site"];
    }
    case "artifact_replicator": {
      const item = requireEntry(lookups.itemNames, source.originalItemId, "itemNames");
      return [`Replicate from ${item}`];
    }
    case "bait_fish":
      return ["Catch with bait"];
    case "breed":
      return ["Breed"];
    case "bug_catch": {
      const locations = buildLocationList(source.locationIds, lookups);
      return [locations ? `Catch at ${locations}` : "Catch"];
    }
    case "chicken_statue":
      return "cost" in source
        ? [`Obtain from the Chicken Statue (${String(source.cost)} beads)`]
        : ["Obtain from the Chicken Statue after breeding every chicken tier"];
    case "crop": {
      const seed = requireEntry(lookups.itemNames, source.seedItemId, "itemNames");
      return [source.greenhouse ? `Grow in the greenhouse from ${seed}` : `Grow from ${seed}`];
    }
    case "cutscene":
      return [buildCutsceneLabel(source.cutsceneId, lookups)];
    case "date":
      return ["Receive on a date"];
    case "date_inspiration": {
      const item = requireEntry(lookups.itemNames, source.itemId, "itemNames");
      return [`Find the ${item}`];
    }
    case "date_inspiration_drop": {
      const date = requireEntry(lookups.dateNames, source.dateId, "dateNames");
      if (source.activity === "mines_chest") {
        return [
          `Chance to find in Mines chests after unlocking any date, until you unlock the ${date}`,
        ];
      }
      const location = requireEntry(lookups.locationNames, source.locationId, "locationNames");
      return [
        source.activity === "dig_site"
          ? `Chance to dig up at dig sites on ${location} after unlocking any date, until you unlock the ${date}`
          : `Find when you catch a fish at ${location} after unlocking any date, until you unlock the ${date}`,
      ];
    }
    case "default":
      return ["Available from the start"];
    case "letter":
      return [
        source.trigger === "birthday" ? "Receive in a birthday letter" : "Receive in a letter",
      ];
    case "dive": {
      const waters = buildWaterList(source.waterTypes, lookups);
      return [waters ? `Dive in ${waters}` : "Dive"];
    }
    case "donate_item":
    case "ship_item": {
      const itemName = requireEntry(lookups.itemNames, source.triggerItemId, "itemNames");
      const itemVis = lookups.itemVisibility[source.triggerItemId];
      const nameWithArticle = withIndefiniteArticle(itemName, locale);
      const itemSegment: SourceSegment =
        itemVis && itemVis.type !== "always"
          ? { condition: itemVis, unspoilered: [nameWithArticle] }
          : nameWithArticle;
      return fillMessage((slot) => {
        const item = slot(itemSegment);
        return source.type === "ship_item"
          ? `Receive in a letter after shipping ${item}`
          : `Receive in a letter after donating ${item}`;
      });
    }
    case "engagement":
      return ["Receive from Elsie after getting to 10 hearts with a dateable villager"];
    case "equipment": {
      const item = requireEntry(lookups.itemNames, source.itemId, "itemNames");
      return [`Use ${item}`];
    }
    case "festival": {
      const festival = requireEntry(lookups.festivals, source.festivalId, "festivals").name;
      const festivalDate = lookups.festivals[source.festivalId]?.date;
      const date = festivalDate
        ? formatDate(festivalDate.season, festivalDate.day, lookups.seasonNames)
        : undefined;
      if (!source.storeId) {
        return [date ? `Obtain at the ${festival} (${date})` : `Obtain at the ${festival}`];
      }
      const store = formatStoreName(source.storeId, lookups.stores, lookups.locale);
      return [
        date
          ? `Purchase from ${store} at the ${festival} (${date})`
          : `Purchase from ${store} at the ${festival}`,
      ];
    }
    case "festival_activity": {
      const festival = requireEntry(lookups.festivals, source.festivalId, "festivals").name;
      return [`Participate in an activity at the ${festival}`];
    }
    case "fish": {
      const waters = buildWaterList(source.waterTypes, lookups);
      return [waters ? `Catch in ${waters}` : "Catch while fishing"];
    }
    case "fish_trap":
      return ["Catch in a fish trap (requires bait)"];
    case "forage": {
      const locations = buildLocationList(source.locationIds, lookups);
      return [locations ? `Forage at ${locations}` : "Forage in the wild"];
    }
    case "lost_and_found":
      return ["Obtain from the Lost and Found chest"];
    case "mine_floor":
      return [`Reach Mines floor ${String(source.floor)}`];
    case "mine": {
      const biomeLabel = formatBiomeLabel(source.biomeId, lookups);
      return fillMessage((slot) => `Mine in ${slot(biomeLabel)}`);
    }
    case "mine_fish": {
      if (!source.biomeId) return ["Fish in the Mines"];
      const biomeLabel = formatBiomeLabel(source.biomeId, lookups);
      return fillMessage((slot) => `Fish in ${slot(biomeLabel)}`);
    }
    case "mines_chest": {
      const biomeLabel = formatBiomeLabel(source.biomeId, lookups);
      if (!source.perkId) {
        return fillMessage((slot) => `Find in a Treasure Chest in ${slot(biomeLabel)}`);
      }
      const perkLabel = formatPerkLabel(source.perkId, lookups);
      return fillMessage(
        (slot) => `Find in a Treasure Chest in ${slot(biomeLabel)}, with ${slot(perkLabel)}`,
      );
    }
    case "mines_dig_site": {
      const biomeLabel = formatBiomeLabel(source.biomeId, lookups);
      if (!source.perkId) {
        return fillMessage((slot) => `Dig up in ${slot(biomeLabel)}`);
      }
      const perk = plainPerkLabel(source.perkId, lookups);

      return [
        {
          condition: { type: "perkUnlocked", perkId: source.perkId },
          unspoilered: fillMessage((slot) => `Dig up in ${slot(biomeLabel)}, with ${perk}`),
        },
      ];
    }
    case "monster":
      return [`Dropped by ${monsterName(source.monsterId, lookups)}`];
    case "monster_feed":
      return [`Feed ${monsterName(source.monsterId, lookups)}`];
    case "museum_donation": {
      const wing = requireEntry(lookups.museumWingNames, source.wingId, "museumWingNames");
      return [
        plural(source.setCount, [
          `Complete ${source.setCount} set in the ${wing} wing`,
          `Complete ${source.setCount} sets in the ${wing} wing`,
        ]),
      ];
    }
    case "perk": {
      const perkLabel = formatPerkLabel(source.perkId, lookups);
      return fillMessage((slot) => `Unlock ${slot(perkLabel)}`);
    }
    case "horse_statue":
      return buildHorseStatueSegments(source, lookups);
    case "perk_drop": {
      const perkLabel = formatPerkLabel(source.perkId, lookups);
      return fillMessage((slot) => `Random drop with ${slot(perkLabel)}`);
    }
    case "proposal": {
      const villager = requireEntry(lookups.villagerNames, source.villagerId, "villagerNames");
      return [`Propose to ${villager}`];
    }
    case "quest":
      return buildQuestSegments(source, lookups);
    case "reach_day": {
      const { day, season, year } = source.triggerDate;
      const date = year
        ? `${lookups.seasonNames[season]} ${String(day)}, Year ${String(year)}`
        : formatDate(season, day, lookups.seasonNames);
      return [`Receive in a letter after reaching ${date}`];
    }
    case "recipe": {
      const recipe = requireEntry(lookups.recipeNames, source.recipeId, "recipeNames");
      const stationId = requireEntry(lookups.recipeStations, source.recipeId, "recipeStations");
      const station = CRAFTING_STATION_LABELS[stationId]();
      return productionSourceLabel(`Craft at ${station} via ${recipe}`, source.visibility);
    }
    case "renown":
      return [`Get the town rank to level ${String(source.level)}`];
    case "ritual_chamber": {
      const perkLabel = formatPerkLabel(source.perkId, lookups);
      return fillMessage((slot) => `Craft at the Ritual Chamber with ${slot(perkLabel)}`);
    }
    case "scroll_bundle": {
      const storeName = buildStoreName(source.storeId, lookups);
      const qualifier = formatStoreQualifier(source, lookups);
      const bundleName = requireEntry(lookups.itemNames, source.bundleItemId, "itemNames");
      const bundleSegment: SourceSegment =
        lookups.entityVisibility && lookups.entityVisibility.type !== "always"
          ? { condition: lookups.entityVisibility, unspoilered: [bundleName] }
          : bundleName;
      return fillMessage((slot) =>
        qualifier
          ? `Purchase the ${slot(bundleSegment)} from ${slot(storeName)} (${slot(qualifier)})`
          : `Purchase the ${slot(bundleSegment)} from ${slot(storeName)}`,
      );
    }
    case "spouseGift": {
      const villager = requireEntry(lookups.villagerNames, source.villagerId, "villagerNames");
      return [`Get married to ${villager}`];
    }
    case "station": {
      const station = requireEntry(lookups.stationNames, source.stationId, "stationNames");
      return productionSourceLabel(`Process at ${station}`, source.visibility);
    }
    case "store": {
      const storeName = buildStoreName(source.storeId, lookups);
      const qualifier = formatStoreQualifier(source, lookups);
      return fillMessage((slot) =>
        qualifier
          ? `Purchase from ${slot(storeName)} (${slot(qualifier)})`
          : `Purchase from ${slot(storeName)}`,
      );
    }
    case "secret_chest": {
      const location = requireEntry(lookups.locationNames, source.locationId, "locationNames");
      return [`Find in the Gold Treasure Chest in the ${location}`];
    }
    case "treasure_chest": {
      const { name } = requireEntry(lookups.treasureChestTiers, source.tier, "treasureChestTiers");
      return [`Fish up ${withIndefiniteArticle(name, locale)}`];
    }
    case "tree": {
      const sapling = requireEntry(lookups.itemNames, source.saplingItemId, "itemNames");
      return [`Harvest from ${sapling}`];
    }
    case "upgrade":
      return [UPGRADE_MESSAGES[source.upgradeId]()];

    case "wedding":
      return ["Receive after getting married"];
    case "wishing_well":
      return [`Obtain from the Wishing Well (${String(source.cost)}t)`];
  }
}

function productionSourceLabel(label: string, condition?: VisibilityCondition): Segments {
  return condition && condition.type !== "always" ? [{ condition, unspoilered: [label] }] : [label];
}

/**
 * The conditions a store source needs before it sells the item, as one gated segment for the
 * `*_qualified` messages to place. Each clause is a bare phrase ("after repairing"), joined by the
 * locale's conjunction, so the message alone decides where the qualifier sits in the sentence.
 */
export function buildStoreQualifier(
  source: Source & { type: "scroll_bundle" | "store"; storeId: StoreId },
  lookups: SegmentLookups,
): SourceSegment | undefined {
  return inLocale(lookups.locale, () => formatStoreQualifier(source, lookups));
}

function formatStoreQualifier(
  source: Source & { type: "scroll_bundle" | "store"; storeId: StoreId },
  lookups: SegmentLookups,
): SourceSegment | undefined {
  const { locale } = lookups;
  const sourceVisibility = source.visibility;
  if (!sourceVisibility || sourceVisibility.type === "always") return undefined;

  const storeGate = lookups.storeVisibility[source.storeId];
  const hasStoreGate =
    storeGate !== undefined &&
    storeGate.type !== "always" &&
    visibilityContains(sourceVisibility, storeGate);
  const storeAction = hasStoreGate
    ? storeActionClause(lookups.stores[source.storeId]?.upgradeAction)
    : undefined;
  const storeQuestIds = storeGate ? collectQuestIds(storeGate) : new Set<QuestId>();
  const stockClauses = source.availability
    ? describeStoreAvailability(source.availability, lookups, storeQuestIds)
    : [];

  const clauses = [
    ...(storeAction ? [storeAction] : []),
    ...(stockClauses ?? []).map(({ clause }) => clause),
  ];
  if (clauses.length === 0) return undefined;

  return {
    condition: sourceVisibility,
    spoilered: fillMessage((slot) =>
      formatConjunction(
        clauses.map(() => slot(SPOILERED)),
        locale,
      ),
    ),
    unspoilered: [formatConjunction(clauses, locale)],
  };
}

export function formatDateLabel(
  season: Season,
  day: number,
  seasonNames: SegmentLookups["seasonNames"],
  locale: LocaleCode,
): string {
  return inLocale(locale, () => formatDate(season, day, seasonNames));
}

function formatDate(
  season: Season,
  day: number,
  seasonNames: SegmentLookups["seasonNames"],
): string {
  return /* @wc-include */ `${seasonNames[season]} ${String(day)}`;
}

/** One "after one of" option: its first clause in branch form, any further ones appended. */
function branchLabel(clauses: StoreClause[]): string {
  return clauses
    .map(({ branch, clause }, index) => (index === 0 ? branch : /* @wc-include */ `, ${clause}`))
    .join("");
}

function buildCookingChallengeSegments(
  source: Source & { type: "quest" },
  lookups: SegmentLookups,
): Segments {
  const recipeName = source.challengeRecipeId
    ? requireEntry(lookups.recipeNames, source.challengeRecipeId, "recipeNames")
    : requireEntry(lookups.questNames, source.questId, "questNames");
  const questVis = source.visibility;
  const categoryVis = lookups.categoryVisibility.cooking;

  const nameSegment: SourceSegment =
    questVis && questVis.type !== "always"
      ? { condition: questVis, unspoilered: [recipeName] }
      : recipeName;

  const inner = fillMessage((slot) => `Complete the ${slot(nameSegment)} cooking challenge`);

  if (!categoryVis || categoryVis.type === "always") return inner;
  return [{ condition: categoryVis, unspoilered: inner }];
}

function buildCrownQuestSegments(
  source: Source & { type: "quest" },
  lookups: SegmentLookups,
): Segments {
  const questName = requireEntry(lookups.questNames, source.questId, "questNames");
  const subject = crownRequestSubject(questName);
  const questVis = source.visibility;
  const categoryVis = lookups.categoryVisibility.crown;

  const subjectSegment: SourceSegment =
    questVis && questVis.type !== "always"
      ? { condition: questVis, unspoilered: [subject] }
      : subject;

  const inner = fillMessage((slot) => `Complete the Crown Request for ${slot(subjectSegment)}`);

  if (!categoryVis || categoryVis.type === "always") return inner;
  return [{ condition: categoryVis, unspoilered: inner }];
}

function buildFetchQuestSegments(
  source: Source & { type: "quest" },
  lookups: SegmentLookups,
): Segments {
  const villagerId = lookups.questVillagerIds[source.questId];
  const villagerName = villagerId
    ? requireEntry(lookups.villagerNames, villagerId, "villagerNames")
    : "???";
  const villagerVis = villagerId ? lookups.villagerVisibility[villagerId] : undefined;
  const questVis = source.visibility;

  const villagerSegment: SourceSegment =
    villagerVis && villagerVis.type !== "always"
      ? { condition: villagerVis, unspoilered: [villagerName] }
      : villagerName;

  const itemId = source.requestedItemId;
  const itemName = itemId ? requireEntry(lookups.itemNames, itemId, "itemNames") : "???";
  const itemSegment: SourceSegment =
    questVis && questVis.type !== "always"
      ? { condition: questVis, unspoilered: [itemName] }
      : itemName;

  return fillMessage(
    (slot) => `Complete ${slot(villagerSegment)}’s request for ${slot(itemSegment)}`,
  );
}

function buildHeartQuestSegments(
  source: Source & { type: "quest" },
  lookups: SegmentLookups,
): Segments {
  const questName = requireEntry(lookups.questNames, source.questId, "questNames");
  const questVis = source.visibility;

  const villagerId = lookups.questVillagerIds[source.questId];
  const villagerName = villagerId
    ? requireEntry(lookups.villagerNames, villagerId, "villagerNames")
    : "???";
  const villagerVis = villagerId ? lookups.villagerVisibility[villagerId] : undefined;

  const villagerSegment: SourceSegment =
    villagerVis && villagerVis.type !== "always"
      ? { condition: villagerVis, unspoilered: [villagerName] }
      : villagerName;
  const questSegment: SourceSegment =
    questVis && questVis.type !== "always"
      ? { condition: questVis, unspoilered: [questName] }
      : questName;

  return fillMessage((slot) => `Complete ${slot(villagerSegment)}’s ${slot(questSegment)} quest`);
}

/** Each reviewed cutscene's own wording; the game names none of them. */
function buildCutsceneLabel(cutsceneId: CutsceneSourceId, lookups: SegmentLookups): string {
  switch (cutsceneId) {
    case "elsie_dating_tutorial": {
      const villager = requireEntry(lookups.villagerNames, "elsie" as VillagerId, "villagerNames");
      return `Receive during ${villager}’s dating tutorial`;
    }
    case "great_bird_0":
      return "Receive in a cutscene after you marry";
  }
}

function buildHorseStatueSegments(
  source: Source & { type: "horse_statue" },
  lookups: SegmentLookups,
): Segments {
  // A mount perk needs the mount itself; its row is hidden until that mount is revealed.
  if ("mountAppearanceId" in source) {
    const mount = requireEntry(lookups.mountNames, source.mountAppearanceId, "mountNames");
    return [`Buy at the Horse Statue (${String(source.cost)} essence) once you have the ${mount}`];
  }
  const questName = requireEntry(lookups.questNames, source.questId, "questNames");
  const questVis = source.visibility;

  // The English message supplies "the", as for story quests.
  const displayName = withoutDefiniteArticle(questName, lookups.locale);
  const nameSegment: SourceSegment =
    questVis && questVis.type !== "always"
      ? { condition: questVis, unspoilered: [displayName] }
      : displayName;

  return fillMessage(
    (slot) =>
      `Unlock at the Horse Statue (${String(source.cost)} essence) after starting the ${slot(nameSegment)} quest`,
  );
}

function buildLocationList(locationIds: LocationId[] | undefined, lookups: SegmentLookups): string {
  return formatAlternatives(
    (locationIds ?? []).map((id) => requireEntry(lookups.locationNames, id, "locationNames")),
    lookups.locale,
  );
}

function buildMissionQuestSegments(
  source: Source & { type: "quest" },
  lookups: SegmentLookups,
): Segments {
  const questName = requireEntry(lookups.questNames, source.questId, "questNames");
  const questVis = source.visibility;
  const categoryVis = lookups.categoryVisibility.mission;

  const nameSegment: SourceSegment =
    questVis && questVis.type !== "always"
      ? { condition: questVis, unspoilered: [questName] }
      : questName;

  const inner = fillMessage((slot) => `Complete the ${slot(nameSegment)} mission`);

  if (!categoryVis || categoryVis.type === "always") return inner;
  return [{ condition: categoryVis, unspoilered: inner }];
}

function buildQuestSegments(source: Source & { type: "quest" }, lookups: SegmentLookups): Segments {
  const questType = source.questType ?? lookups.questTypes[source.questId];
  if (!questType) throw new Error(`Unknown quest type for ${source.questId}`);

  switch (questType) {
    case "cooking":
      return buildCookingChallengeSegments(source, lookups);
    case "crown":
      return buildCrownQuestSegments(source, lookups);
    case "fetch":
      return buildFetchQuestSegments(source, lookups);
    case "heart":
      return buildHeartQuestSegments(source, lookups);
    case "mission":
      return buildMissionQuestSegments(source, lookups);
    case "story":
      return buildStoryQuestSegments(source, lookups);
  }
}

function buildStoreName(storeId: StoreId, lookups: SegmentLookups): Segments {
  const vis = lookups.storeVisibility[storeId];
  const name = formatStoreName(storeId, lookups.stores, lookups.locale);
  if (!vis || vis.type === "always") return [name];
  return [{ condition: vis, unspoilered: [name] }];
}

function buildStoryQuestSegments(
  source: Source & { type: "quest" },
  lookups: SegmentLookups,
): Segments {
  const questName = requireEntry(lookups.questNames, source.questId, "questNames");
  const questVis = source.visibility;

  // The English message supplies "the", so drop the name's own to avoid "the The".
  const displayName = withoutDefiniteArticle(questName, lookups.locale);
  const nameSegment: SourceSegment =
    questVis && questVis.type !== "always"
      ? { condition: questVis, unspoilered: [displayName] }
      : displayName;

  return fillMessage((slot) => `Complete the ${slot(nameSegment)} quest`);
}

function buildWaterList(waterTypes: undefined | WaterType[], lookups: SegmentLookups): string {
  return formatAlternatives(
    (waterTypes ?? []).map((w) => requireEntry(lookups.waterNames, w, "waterNames")),
    lookups.locale,
  );
}

function collectQuestIds(condition: VisibilityCondition): Set<QuestId> {
  if (condition.type === "questAvailable" || condition.type === "questCompleted") {
    return new Set([condition.questId]);
  }
  if (condition.type === "and" || condition.type === "or") {
    return new Set(condition.conditions.flatMap((child) => [...collectQuestIds(child)]));
  }
  return new Set();
}

/**
 * The subject of a crown request's name, without the "Crown Request:" prefix every locale gives
 * it. Locales separate the prefix with a colon (`:` or `：`) or, in Japanese, a line break.
 */
function crownRequestSubject(questName: string): string {
  const subject = questName.replace(/^[^:：\n]*[:：\n]\s*/, "");
  if (subject !== questName) return subject;
  return questName.replace(/^Crown Request\s*/, "");
}

function same(text: string): StoreClause {
  return { branch: text, clause: text };
}

function describeStoreAvailability(
  condition: AvailabilityCondition,
  lookups: SegmentLookups,
  storeQuestIds: ReadonlySet<QuestId>,
): StoreClause[] | undefined {
  switch (condition.type) {
    case "all":
      return condition.conditions.flatMap(
        (child) => describeStoreAvailability(child, lookups, storeQuestIds) ?? [],
      );
    case "always":
    case "season":
    case "time":
    case "weather":
      return [];
    case "any": {
      const branches = condition.conditions.map((child) =>
        describeStoreAvailability(child, lookups, storeQuestIds),
      );
      if (branches.some((branch) => !branch || branch.length === 0)) return undefined;
      const options = formatAlternatives(
        branches.map((branch) => branchLabel(branch ?? [])),
        lookups.locale,
      );
      return [same(/* @wc-include */ `after one of: ${options}`)];
    }
    case "dateUnlocked":
    case "gamePredicate":
    case "itemAcquired":
    case "renownLevel":
    case "not":
      return undefined;
    case "hasUpperFloor":
      return [same(/* @wc-include */ "after upgrading your home")];
    case "heartLevel": {
      const villager = requireEntry(lookups.villagerNames, condition.villagerId, "villagerNames");
      const level = String(condition.level);
      return [
        {
          branch: `${level} hearts with ${villager}`,
          clause: /* @wc-include */ `at ${level} hearts with ${villager}`,
        },
      ];
    }
    case "isDating":
      return [same(/* @wc-include */ "while dating someone")];
    case "mineFloor": {
      const floor = String(condition.floor);
      return [
        {
          branch: /* @wc-include */ `reaching Mines floor ${floor}`,
          clause: /* @wc-include */ `after reaching Mines floor ${floor}`,
        },
      ];
    }
    case "perkUnlocked": {
      const perk = plainPerkLabel(condition.perkId, lookups);
      return [{ branch: perk, clause: /* @wc-include */ `with ${perk}` }];
    }
    case "quest": {
      if (storeQuestIds.has(condition.questId)) return [];
      if (condition.questId.startsWith("repair_")) {
        return [same(/* @wc-include */ "after repairing")];
      }
      if (condition.questId.startsWith("upgrade_")) {
        return [same(/* @wc-include */ "after upgrading")];
      }
      const quest = requireEntry(lookups.questNames, condition.questId, "questNames");
      return condition.state === "completed"
        ? [
            {
              branch: /* @wc-include */ `completing ${quest}`,
              clause: /* @wc-include */ `after completing ${quest}`,
            },
          ]
        : [
            {
              branch: `${quest} is available`,
              clause: /* @wc-include */ `once ${quest} is available`,
            },
          ];
    }
    case "reachedSeason": {
      const season = lookups.seasonNames[condition.season];
      return [
        {
          branch: /* @wc-include */ `reaching ${season}`,
          clause: /* @wc-include */ `after reaching ${season}`,
        },
      ];
    }
    case "skillLevel": {
      const skill = requireEntry(lookups.skillNames, condition.skillId, "skillNames");
      const level = String(condition.level);
      return [
        {
          branch: `${skill} level ${level}`,
          clause: /* @wc-include */ `at ${skill} level ${level}`,
        },
      ];
    }
  }
}

/**
 * Renders a localized message whose placeholders hold segments rather than plain text. `render`
 * receives a `slot` function that swaps a segment for a private-use marker; the rendered string is
 * split back apart at the markers, so each locale's word order decides where the segments land.
 */
function fillMessage(render: (slot: (value: Slot) => string) => string): Segments {
  const slots: Slot[] = [];
  const text = render((value) => {
    slots.push(value);
    return `${String(slots.length - 1)}`;
  });

  const used = new Set<number>();
  const parts = text.split(SLOT_MARKER).map((part, index) => {
    if (index % 2 === 0) return part;
    const slotIndex = Number(part);
    used.add(slotIndex);
    return slots[slotIndex] ?? [];
  });
  if (used.size !== slots.length) {
    throw new Error(`Message dropped a placeholder: ${JSON.stringify(text)}`);
  }

  return joinSegments(...parts.filter((part) => part !== ""));
}

/** Joins alternatives the way the locale writes "A, B, or C". */
function formatAlternatives(items: string[], locale: LocaleCode): string {
  return new Intl.ListFormat(locale, { type: "disjunction" }).format(items);
}

/** Joins required conditions the way the locale writes "A, B, and C". */
function formatConjunction(items: string[], locale: LocaleCode): string {
  return new Intl.ListFormat(locale, { type: "conjunction" }).format(items);
}

function joinSegments(...parts: (SourceSegment | SourceSegment[])[]): Segments {
  const flat: SourceSegment[] = [];
  for (const part of parts) {
    if (Array.isArray(part)) {
      flat.push(...part);
    } else {
      flat.push(part);
    }
  }

  const merged: SourceSegment[] = [];
  for (const segment of flat) {
    const last = merged.at(-1);
    if (typeof segment === "string" && typeof last === "string") {
      merged[merged.length - 1] = last + segment;
    } else {
      merged.push(segment);
    }
  }

  if (merged.length === 0) throw new Error("joinSegments: no segments provided");
  return merged as Segments;
}

function monsterName(monsterId: string, lookups: SegmentLookups): string {
  if (monsterId === "any") return /* @wc-include */ "any monster";
  return requireEntry(lookups.monsterNames, monsterId, "monsterNames");
}

function plainPerkLabel(perkId: PerkId, lookups: SegmentLookups): string {
  const perk = requireEntry(lookups.perks, perkId, "perks");
  const skill = requireEntry(lookups.skillNames, perk.skillId, "skillNames");
  return /* @wc-include */ `the ${perk.name} perk (${skill} tier ${String(perk.tier)})`;
}

function storeActionClause(action: StoreUpgradeAction | undefined): string {
  return action ? STORE_ACTION_CLAUSES[action]() : /* @wc-include */ "after upgrading";
}

function visibilityContains(
  condition: VisibilityCondition,
  expected: VisibilityCondition,
): boolean {
  if (
    (condition.type === "questAvailable" || condition.type === "questCompleted") &&
    (expected.type === "questAvailable" || expected.type === "questCompleted")
  ) {
    return condition.questId === expected.questId;
  }
  if (condition.type === "and" || condition.type === "or") {
    return condition.conditions.some((child) => visibilityContains(child, expected));
  }
  return JSON.stringify(condition) === JSON.stringify(expected);
}
