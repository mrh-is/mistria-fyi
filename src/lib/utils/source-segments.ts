import { formatBiomeName, formatStoreName, withIndefiniteArticle } from "./format";

import type { AvailabilityCondition, Source } from "$lib/types/acquisition.js";
import type {
  LocationId,
  MinesBiomeId,
  PerkId,
  QuestId,
  QuestType,
  Season,
  StoreId,
  TrackerData,
  VillagerId,
  WaterType,
} from "$lib/types/tracker-data.js";
import type { VisibilityCondition } from "$lib/types/visibility.js";

import type { NameLookup, RecipeSourceLookups } from "./format";

export type SegmentLookups = Pick<TrackerData, "categoryVisibility"> &
  RecipeSourceLookups & {
    animalNames: NameLookup<TrackerData["animals"]>;
    entityVisibility?: VisibilityCondition;
    itemVisibility: VisibilityLookup<TrackerData["items"]>;
    locationNames: Partial<Record<string, string>>;
    monsterNames: Partial<Record<string, string>>;
    questTypes: Partial<Record<QuestId, QuestType>>;
    questVillagerIds: Partial<Record<QuestId, VillagerId>>;
    /** The game's season names in the active locale (`ui` chunk). */
    seasonNames: Record<Season, string>;
    stationNames: Partial<Record<string, string>>;
    storeVisibility: VisibilityLookup<TrackerData["stores"]>;
    villagerNames: NameLookup<TrackerData["villagers"]>;
    villagerVisibility: VisibilityLookup<TrackerData["villagers"]>;
  };

export type SourceSegment =
  | string
  | {
      condition: VisibilityCondition;
      redacted?: [SourceSegment, ...SourceSegment[]];
      revealed: [SourceSegment, ...SourceSegment[]];
    }
  | { redacted: true };

type VisibilityLookup<T> = Partial<Record<keyof T, VisibilityCondition>>;

export function buildBiomeLabel(
  biomeId: MinesBiomeId,
  lookups: SegmentLookups,
): [SourceSegment, ...SourceSegment[]] {
  const biome = lookups.biomes.find((b) => b.id === biomeId);
  if (!biome) return [titleCase(biomeId)];

  const condition: VisibilityCondition = { type: "minesLevel", floor: biome.floors.start };
  const biomeName = formatBiomeName(biomeId, lookups.biomes);
  const floorRange = `Mines floors ${String(biome.floors.start)}–${String(biome.floors.end)}`;

  return [
    {
      condition,
      redacted: [
        { redacted: true },
        " (Mines floors ",
        { redacted: true },
        "–",
        { redacted: true },
        ")",
      ],
      revealed: [`${biomeName} (${floorRange})`],
    },
  ];
}

export function buildPerkLabel(
  perkId: PerkId,
  lookups: SegmentLookups,
): [SourceSegment, ...SourceSegment[]] {
  const perk = lookups.perks[perkId];
  if (!perk) return [`the ${titleCase(perkId)} perk`];

  const skillName = lookups.skillNames[perk.skillId] ?? titleCase(perk.skillId);
  const tierSuffix = ` (${skillName} tier ${String(perk.tier)})`;
  const level = lookups.perkTierLevels[perk.tier - 1];
  const condition: VisibilityCondition = {
    type: "skillLevel",
    level,
    skillId: perk.skillId,
  };

  return [
    {
      condition,
      redacted: ["the ", { redacted: true }, ` perk${tierSuffix}`],
      revealed: [`the ${perk.name} perk${tierSuffix}`],
    },
  ];
}

export function buildSourceSegments(
  source: Source,
  lookups: SegmentLookups,
): [SourceSegment, ...SourceSegment[]] {
  switch (source.type) {
    case "animal_product": {
      const name = lookups.animalNames[source.animalId] ?? titleCase(source.animalId);
      return [`Collect from ${name}`];
    }
    case "artifact_dig": {
      const locations = buildLocationList(source.locationIds, lookups);
      return [locations ? `Dig up at ${locations}` : "Dig up at an artifact dig site"];
    }
    case "artifact_replicator": {
      const itemName = lookups.itemNames[source.originalItemId] ?? titleCase(source.originalItemId);
      return [`Replicate from ${itemName}`];
    }
    case "bait_fish":
      return ["Catch with bait"];
    case "beach_cave_chest":
      return ["Find in the Gold Treasure Chest in the Beach Cave"];
    case "breed":
      return ["Breed"];
    case "bug_catch": {
      const locations = buildLocationList(source.locationIds, lookups);
      return [locations ? `Catch at ${locations}` : "Catch"];
    }
    case "chicken_statue":
      return [`Obtain from the Chicken Statue (${String(source.cost)} beads)`];
    case "crop": {
      const seedName = lookups.itemNames[source.seedItemId] ?? titleCase(source.seedItemId);
      return [`Grow from ${seedName}`];
    }
    case "date":
      return ["Receive on a date"];
    case "date_inspiration": {
      const itemName = lookups.itemNames[source.itemId] ?? titleCase(source.itemId);
      return [`Find the ${itemName}`];
    }
    case "default":
      return ["Available from the start"];
    case "dive": {
      const waters = buildWaterList(source.waterTypes);
      return [waters ? `Dive in ${waters}` : "Dive"];
    }
    case "donate_item":
    case "ship_item": {
      const verb = source.type === "ship_item" ? "shipping" : "donating";
      const itemName = lookups.itemNames[source.triggerItemId] ?? titleCase(source.triggerItemId);
      const itemVis = lookups.itemVisibility[source.triggerItemId];
      const nameWithArticle = withIndefiniteArticle(itemName);
      const itemSegment: SourceSegment =
        itemVis && itemVis.type !== "always"
          ? { condition: itemVis, revealed: [nameWithArticle] }
          : nameWithArticle;
      return joinSegments(`Receive in a letter after ${verb} `, itemSegment);
    }
    case "engagement":
      return ["Receive from Elsie after getting to 10 hearts with a dateable villager"];
    case "equipment": {
      const itemName = lookups.itemNames[source.itemId] ?? titleCase(source.itemId);
      return [`Use ${itemName}`];
    }
    case "festival": {
      const festivalName =
        lookups.festivals[source.festivalId]?.name ?? titleCase(source.festivalId);
      const date = lookups.festivals[source.festivalId]?.date;
      const dateSuffix = date
        ? ` (${formatDateLabel(date.season, date.day, lookups.seasonNames)})`
        : "";
      if (!source.storeId) return [`Obtain at the ${festivalName}${dateSuffix}`];
      const storeName = formatStoreName(source.storeId, lookups.stores);
      return [`Purchase from ${storeName} at the ${festivalName}${dateSuffix}`];
    }
    case "festival_activity": {
      const festivalName =
        lookups.festivals[source.festivalId]?.name ?? titleCase(source.festivalId);
      return [`Participate in an activity at the ${festivalName}`];
    }
    case "fish": {
      const waters = buildWaterList(source.waterTypes);
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
    case "mine": {
      const biomeLabel = buildBiomeLabel(source.biomeId, lookups);
      return joinSegments("Mine in ", biomeLabel);
    }
    case "mine_fish": {
      if (!source.biomeId) return ["Fish in the mines"];
      const biomeLabel = buildBiomeLabel(source.biomeId, lookups);
      return joinSegments("Fish in ", biomeLabel);
    }
    case "mines_chest": {
      const biomeLabel = buildBiomeLabel(source.biomeId, lookups);
      if (!source.perkId) return joinSegments("Find in a Treasure Chest in ", biomeLabel);
      const perkLabel = buildPerkLabel(source.perkId, lookups);
      return joinSegments("Find in a Treasure Chest in ", biomeLabel, ", with ", perkLabel);
    }
    case "mines_dig_site": {
      const biomeLabel = buildBiomeLabel(source.biomeId, lookups);
      if (!source.perkId) return joinSegments("Dig up in ", biomeLabel);
      const perk = lookups.perks[source.perkId];
      const perkName = perk?.name ?? titleCase(source.perkId);
      const skillName = perk ? (lookups.skillNames[perk.skillId] ?? titleCase(perk.skillId)) : "";
      const tierStr = perk ? ` (${skillName} tier ${String(perk.tier)})` : "";

      return [
        {
          condition: { type: "perkUnlocked", perkId: source.perkId },
          revealed: joinSegments("Dig up in ", biomeLabel, `, with the ${perkName} perk${tierStr}`),
        },
      ];
    }
    case "monster": {
      const name = lookups.monsterNames[source.monsterId] ?? titleCase(source.monsterId);
      return [`Dropped by ${name}`];
    }

    case "monster_feed": {
      const name = lookups.monsterNames[source.monsterId] ?? titleCase(source.monsterId);
      return [`Feed ${name}`];
    }
    case "museum_donation": {
      const wingName = titleCase(source.wingId);
      const setWord = source.setCount === 1 ? "set" : "sets";
      return [`Complete ${String(source.setCount)} ${setWord} in the ${wingName} wing`];
    }
    case "perk": {
      const perkLabel = buildPerkLabel(source.perkId, lookups);
      return joinSegments("Unlock ", perkLabel);
    }
    case "perk_drop": {
      const perkLabel = buildPerkLabel(source.perkId, lookups);
      return joinSegments("Random drop with ", perkLabel);
    }
    case "proposal": {
      const villagerName = lookups.villagerNames[source.villagerId] ?? titleCase(source.villagerId);
      return [`Propose to ${villagerName}`];
    }
    case "quest":
      return buildQuestSegments(source, lookups);
    case "reach_day": {
      const { day, season, year } = source.triggerDate;
      const dateStr = year
        ? `${formatDateLabel(season, day, lookups.seasonNames)}, Year ${String(year)}`
        : formatDateLabel(season, day, lookups.seasonNames);
      return [`Receive in a letter after reaching ${dateStr}`];
    }
    case "recipe": {
      const recipeName = lookups.recipeNames[source.recipeId] ?? titleCase(source.recipeId);
      const methodLabel = titleCase(source.method);
      return [`${methodLabel} via ${recipeName}`];
    }
    case "renown":
      return [`Get the town's renown rank to level ${String(source.level)}`];
    case "ritual_chamber": {
      const perkLabel = buildPerkLabel(source.perkId, lookups);
      return joinSegments("Craft at the Ritual Chamber with ", perkLabel);
    }
    case "scroll_bundle": {
      const storeName = buildStoreName(source.storeId, lookups);
      const qualifier = buildStoreQualifier(source, lookups);
      const bundleSegment: SourceSegment =
        lookups.entityVisibility && lookups.entityVisibility.type !== "always"
          ? { condition: lookups.entityVisibility, revealed: [`the ${source.bundleName}`] }
          : `the ${source.bundleName}`;
      return joinSegments("Purchase ", bundleSegment, " from ", storeName, qualifier);
    }
    case "spouseGift": {
      const villagerName = lookups.villagerNames[source.villagerId] ?? titleCase(source.villagerId);
      return [`Get married to ${villagerName}`];
    }
    case "station": {
      const stationName = lookups.stationNames[source.stationId] ?? titleCase(source.stationId);
      return [`Process at ${stationName}`];
    }
    case "store": {
      const storeName = buildStoreName(source.storeId, lookups);
      const qualifier = buildStoreQualifier(source, lookups);
      return joinSegments("Purchase from ", storeName, qualifier);
    }
    case "treasure_chest": {
      const tierData = lookups.treasureChestTiers[source.tier];
      const name = tierData?.name ?? `${titleCase(source.tier)} Treasure Box`;
      return [`Fish up ${withIndefiniteArticle(name)}`];
    }
    case "tree": {
      const saplingName =
        lookups.itemNames[source.saplingItemId] ?? titleCase(source.saplingItemId);
      return [`Harvest from ${saplingName}`];
    }
    case "upgrade":
      return [upgradeSourceText(source)];
    case "wedding":
      return ["Receive after getting married"];
    case "wishing_well":
      return [`Obtain from the Wishing Well (${String(source.cost)}t)`];
  }
}

export function buildStoreQualifier(
  source: Source & { type: "scroll_bundle" | "store"; storeId: StoreId },
  lookups: SegmentLookups,
): SourceSegment[] {
  const sourceVisibility = source.visibility;
  if (!sourceVisibility || sourceVisibility.type === "always") return [];

  const storeGate = lookups.storeVisibility[source.storeId];
  const hasStoreGate =
    storeGate !== undefined &&
    storeGate.type !== "always" &&
    visibilityContains(sourceVisibility, storeGate);
  const storeAction = hasStoreGate
    ? (lookups.stores[source.storeId]?.upgradeAction ?? "upgrading")
    : undefined;
  const storeQuestIds = storeGate ? collectQuestIds(storeGate) : new Set<QuestId>();
  const stockFragments = source.availability
    ? describeStoreAvailability(source.availability, lookups, storeQuestIds)
    : [];

  if (stockFragments === undefined && !storeAction) return [];

  const renderedStockFragments = stockFragments ?? [];
  if (!storeAction && renderedStockFragments.length === 0) return [];

  const revealed = `${storeAction ? ` (after ${storeAction})` : ""}${renderedStockFragments.join("")}`;
  const redacted: SourceSegment[] = [];
  if (storeAction) redacted.push(" (after ", { redacted: true }, ")");
  for (const _fragment of renderedStockFragments) {
    redacted.push(", ", { redacted: true });
  }

  return [
    {
      condition: sourceVisibility,
      redacted: redacted as [SourceSegment, ...SourceSegment[]],
      revealed: [revealed],
    },
  ];
}

export function formatDateLabel(
  season: Season,
  day: number,
  seasonNames: SegmentLookups["seasonNames"],
): string {
  return `${seasonNames[season]} ${String(day)}`;
}

function anyBranchLabel(fragments: string[]): string {
  return fragments
    .join("")
    .replace(/^, after reaching /, "reaching ")
    .replace(/^, after completing /, "completing ")
    .replace(/^, at /, "")
    .replace(/^, once /, "")
    .replace(/^, with /, "");
}

function buildCookingChallengeSegments(
  source: Source & { type: "quest" },
  lookups: SegmentLookups,
): [SourceSegment, ...SourceSegment[]] {
  const recipeName = source.challengeRecipeId
    ? (lookups.recipeNames[source.challengeRecipeId] ?? titleCase(source.challengeRecipeId))
    : (lookups.questNames[source.questId] ?? titleCase(source.questId));
  const questVis = source.visibility;
  const categoryVis = lookups.categoryVisibility.cooking;

  const nameSegment: SourceSegment =
    questVis && questVis.type !== "always"
      ? { condition: questVis, revealed: [recipeName] }
      : recipeName;

  const inner = joinSegments("Complete the ", nameSegment, " cooking challenge");

  if (!categoryVis || categoryVis.type === "always") return inner;
  return [{ condition: categoryVis, revealed: inner }];
}

function buildCrownQuestSegments(
  source: Source & { type: "quest" },
  lookups: SegmentLookups,
): [SourceSegment, ...SourceSegment[]] {
  const questName = lookups.questNames[source.questId] ?? titleCase(source.questId);
  const subject = questName.replace(/^Crown Request:?\s*/, "");
  const questVis = source.visibility;
  const categoryVis = lookups.categoryVisibility.crown;

  const subjectSegment: SourceSegment =
    questVis && questVis.type !== "always" ? { condition: questVis, revealed: [subject] } : subject;

  const inner = joinSegments("Complete the Crown Request for ", subjectSegment);

  if (!categoryVis || categoryVis.type === "always") return inner;
  return [{ condition: categoryVis, revealed: inner }];
}

function buildFetchQuestSegments(
  source: Source & { type: "quest" },
  lookups: SegmentLookups,
): [SourceSegment, ...SourceSegment[]] {
  const villagerId = lookups.questVillagerIds[source.questId];
  const villagerName = villagerId
    ? (lookups.villagerNames[villagerId] ?? titleCase(villagerId))
    : "???";
  const villagerVis = villagerId ? lookups.villagerVisibility[villagerId] : undefined;
  const questVis = source.visibility;

  const villagerSegment: SourceSegment =
    villagerVis && villagerVis.type !== "always"
      ? { condition: villagerVis, revealed: [villagerName] }
      : villagerName;

  const itemId = source.requestedItemId;
  const itemName = itemId ? (lookups.itemNames[itemId] ?? titleCase(itemId)) : "???";
  const itemSegment: SourceSegment =
    questVis && questVis.type !== "always"
      ? { condition: questVis, revealed: [itemName] }
      : itemName;

  return joinSegments("Complete ", villagerSegment, "'s request for ", itemSegment);
}

function buildHeartQuestSegments(
  source: Source & { type: "quest" },
  lookups: SegmentLookups,
): [SourceSegment, ...SourceSegment[]] {
  const questName = lookups.questNames[source.questId] ?? titleCase(source.questId);
  const questVis = source.visibility;

  const villagerId = lookups.questVillagerIds[source.questId];
  const villagerName = villagerId
    ? (lookups.villagerNames[villagerId] ?? titleCase(villagerId))
    : "???";
  const villagerVis = villagerId ? lookups.villagerVisibility[villagerId] : undefined;

  const villagerSegment: SourceSegment =
    villagerVis && villagerVis.type !== "always"
      ? { condition: villagerVis, revealed: [villagerName] }
      : villagerName;
  const questSegment: SourceSegment =
    questVis && questVis.type !== "always"
      ? { condition: questVis, revealed: [questName] }
      : questName;

  return joinSegments("Complete ", villagerSegment, "'s ", questSegment, " quest");
}

function buildLocationList(locationIds: LocationId[] | undefined, lookups: SegmentLookups): string {
  return (locationIds ?? []).map((id) => lookups.locationNames[id] ?? titleCase(id)).join(", ");
}

function buildMissionQuestSegments(
  source: Source & { type: "quest" },
  lookups: SegmentLookups,
): [SourceSegment, ...SourceSegment[]] {
  const questName = lookups.questNames[source.questId] ?? titleCase(source.questId);
  const questVis = source.visibility;
  const categoryVis = lookups.categoryVisibility.mission;

  const nameSegment: SourceSegment =
    questVis && questVis.type !== "always"
      ? { condition: questVis, revealed: [questName] }
      : questName;

  const inner = joinSegments("Complete the ", nameSegment, " mission");

  if (!categoryVis || categoryVis.type === "always") return inner;
  return [{ condition: categoryVis, revealed: inner }];
}

function buildQuestSegments(
  source: Source & { type: "quest" },
  lookups: SegmentLookups,
): [SourceSegment, ...SourceSegment[]] {
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

function buildStoreName(
  storeId: StoreId,
  lookups: SegmentLookups,
): [SourceSegment, ...SourceSegment[]] {
  const vis = lookups.storeVisibility[storeId];
  const name = formatStoreName(storeId, lookups.stores);
  if (!vis || vis.type === "always") return [name];
  return [{ condition: vis, revealed: [name] }];
}

function buildStoryQuestSegments(
  source: Source & { type: "quest" },
  lookups: SegmentLookups,
): [SourceSegment, ...SourceSegment[]] {
  const questName = lookups.questNames[source.questId] ?? titleCase(source.questId);
  const questVis = source.visibility;

  // Handle quest names starting with "The" to avoid "the The"
  const displayName = questName.startsWith("The ") ? questName.slice(4) : questName;
  const prefix = "Complete the ";

  if (!questVis || questVis.type === "always") {
    return [`${prefix}${displayName} quest`];
  }
  return joinSegments(prefix, { condition: questVis, revealed: [displayName] }, " quest");
}

function buildWaterList(waterTypes: undefined | WaterType[]): string {
  return (waterTypes ?? []).map((w) => titleCase(w)).join(", ");
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

function describeStoreAvailability(
  condition: AvailabilityCondition,
  lookups: SegmentLookups,
  storeQuestIds: ReadonlySet<QuestId>,
): string[] | undefined {
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
      return [
        `, after one of: ${branches.map((branch) => anyBranchLabel(branch ?? [])).join(" or ")}`,
      ];
    }
    case "gamePredicate":
    case "not":
      return undefined;
    case "hasUpperFloor":
      return [", after upgrading your home"];
    case "heartLevel": {
      const villagerName =
        lookups.villagerNames[condition.villagerId] ?? titleCase(condition.villagerId);
      return [`, at ${String(condition.level)} hearts with ${villagerName}`];
    }
    case "isDating":
      return [", while dating someone"];
    case "minesLevel":
      return [`, after reaching Mines floor ${String(condition.floor)}`];
    case "perkUnlocked":
      return [`, with ${plainPerkLabel(condition.perkId, lookups)}`];
    case "quest": {
      if (storeQuestIds.has(condition.questId)) return [];
      if (condition.questId.startsWith("repair_")) return [", after repairing"];
      if (condition.questId.startsWith("upgrade_")) return [", after upgrading"];
      const questName = lookups.questNames[condition.questId] ?? titleCase(condition.questId);
      return condition.state === "completed"
        ? [`, after completing ${questName}`]
        : [`, once ${questName} is available`];
    }
    case "reachedSeason": {
      const seasonName = condition.season.charAt(0).toUpperCase() + condition.season.slice(1);
      return [`, after reaching ${seasonName}`];
    }
    case "skillLevel": {
      const skillName = lookups.skillNames[condition.skillId] ?? titleCase(condition.skillId);
      return [`, at ${skillName} level ${String(condition.level)}`];
    }
  }
}

function joinSegments(
  ...parts: (SourceSegment | SourceSegment[])[]
): [SourceSegment, ...SourceSegment[]] {
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
  return merged as [SourceSegment, ...SourceSegment[]];
}

function plainPerkLabel(perkId: PerkId, lookups: SegmentLookups): string {
  const perk = lookups.perks[perkId];
  if (!perk) return `the ${titleCase(perkId)} perk`;
  const skillName = lookups.skillNames[perk.skillId] ?? titleCase(perk.skillId);
  return `the ${perk.name} perk (${skillName} tier ${String(perk.tier)})`;
}

function titleCase(s: string): string {
  return s
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function upgradeSourceText(source: Source & { type: "upgrade" }): string {
  const UPGRADE_TEXT: Record<string, string> = {
    adept_kitchen: "Upgrade to the adept kitchen",
    cozy_kitchen: "Upgrade to the cozy kitchen",
    farm_bridge: "Expand your farm",
    stairs: "Upgrade your home a fourth time",
  };
  return UPGRADE_TEXT[source.upgradeName] ?? `Purchase ${source.upgradeName}`;
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
