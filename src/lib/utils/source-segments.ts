import { formatBiomeName, formatStoreName, seasonLabel, withIndefiniteArticle } from "./format.js";

import type {
  AcquisitionSource,
  BiomeId,
  FestivalId,
  ItemId,
  LocationId,
  NpcId,
  PerkId,
  QuestId,
  Season,
  StoreId,
  WaterType,
} from "$lib/types/tracker-data.js";
import type { VisibilityCondition } from "$lib/types/visibility.js";

import type { RecipeSourceLookups } from "./format.js";

export interface SegmentLookups extends RecipeSourceLookups {
  animalNames: Partial<Record<string, string>>;
  categoryVisibility: Partial<Record<string, VisibilityCondition>>;
  festivalDates: Partial<Record<FestivalId, { day: number; season: Season }>>;
  itemVisibility: Partial<Record<ItemId, VisibilityCondition>>;
  locationNames: Partial<Record<string, string>>;
  monsterNames: Partial<Record<string, string>>;
  npcNames: Partial<Record<NpcId, string>>;
  npcVisibility: Partial<Record<NpcId, VisibilityCondition>>;
  questNpcIds: Partial<Record<QuestId, NpcId>>;
  recipeVisibility: VisibilityCondition;
  stationNames: Partial<Record<string, string>>;
  storeVisibility: Partial<Record<StoreId, VisibilityCondition>>;
}

export type SourceSegment =
  | string
  | {
      condition: VisibilityCondition;
      redacted?: [SourceSegment, ...SourceSegment[]];
      revealed: [SourceSegment, ...SourceSegment[]];
    }
  | { redacted: true };

export function buildBiomeLabel(
  biomeId: BiomeId,
  lookups: SegmentLookups,
): [SourceSegment, ...SourceSegment[]] {
  const biome = lookups.biomes.find((b) => b.id === biomeId);
  if (!biome) return [titleCase(biomeId)];

  const condition: VisibilityCondition = { floor: biome.startFloor, type: "minesLevel" };
  const biomeName = formatBiomeName(biomeId, lookups.biomes);
  const floorRange = `Mines floors ${String(biome.startFloor)}–${String(biome.endFloor)}`;

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
  const perk = lookups.perks[perkId as string];
  if (!perk) return [`the ${titleCase(perkId)} perk`];

  const skillName = lookups.skillNames[perk.skillId] ?? titleCase(perk.skillId);
  const tierSuffix = ` (${skillName} tier ${String(perk.tier)})`;
  const condition = perk.visibility;
  if (!condition) return [`the ${perk.name} perk${tierSuffix}`];

  return [
    {
      condition,
      redacted: ["the ", { redacted: true }, ` perk${tierSuffix}`],
      revealed: [`the ${perk.name} perk${tierSuffix}`],
    },
  ];
}

export function buildSourceSegments(
  source: AcquisitionSource,
  lookups: SegmentLookups,
): [SourceSegment, ...SourceSegment[]] {
  switch (source.type) {
    case "animal_product": {
      const name = lookups.animalNames[source.animalId as string] ?? titleCase(source.animalId);
      return [`Collect from ${name}`];
    }
    case "artifact_dig": {
      const locations = buildLocationList(source.locationIds, lookups);
      return [locations ? `Dig up at ${locations}` : "Dig up at an artifact dig site"];
    }
    case "artifact_replicator": {
      const itemName =
        lookups.itemNames[source.originalItemId as string] ?? titleCase(source.originalItemId);
      return [`Replicate from ${itemName} (${String(source.requiredSetCount)} museum sets)`];
    }
    case "beach_cave_chest":
      return ["Find in the Gold Treasure Chest in the Beach Cave"];
    case "bug_catch": {
      const locations = buildLocationList(source.locationIds, lookups);
      return [locations ? `Catch at ${locations}` : "Catch"];
    }
    case "chicken_statue":
      return [`Obtain from the Chicken Statue (${String(source.cost.amount)} beads)`];
    case "crop": {
      const seedName =
        lookups.itemNames[source.seedItemId as string] ?? titleCase(source.seedItemId);
      return [`Grow from ${seedName}`];
    }
    case "date":
      return ["Receive on a date"];
    case "default":
      return ["Available from the start"];
    case "dive": {
      const waters = buildWaterList(source.waterTypes);
      return [waters ? `Dive in ${waters}` : "Dive"];
    }
    case "engagement":
      return ["Receive from Elsie after getting to 10 hearts with a dateable character"];
    case "equipment": {
      const itemName = lookups.itemNames[source.itemId as string] ?? titleCase(source.itemId);
      return [`Use ${itemName}`];
    }
    case "festival": {
      const festivalName =
        lookups.festivals[source.festivalId as string]?.name ?? titleCase(source.festivalId);
      const date = lookups.festivalDates[source.festivalId];
      const dateSuffix = date ? ` (${formatDateLabel(date.season, date.day)})` : "";
      if (!source.storeId) return [`Obtain at the ${festivalName}${dateSuffix}`];
      const storeName = formatStoreName(source.storeId, lookups.stores);
      return [`Purchase from ${storeName} at the ${festivalName}${dateSuffix}`];
    }
    case "festival_activity": {
      const festivalName =
        lookups.festivals[source.festivalId as string]?.name ?? titleCase(source.festivalId);
      return [`Participate in an activity at the ${festivalName}`];
    }
    case "fish": {
      const waters = buildWaterList(source.waterTypes);
      return [waters ? `Catch in ${waters}` : "Catch while fishing"];
    }
    case "fish_trap":
      return ["Catch in a fish trap"];
    case "forage": {
      const locations = buildLocationList(source.locationIds, lookups);
      return [locations ? `Forage at ${locations}` : "Forage in the wild"];
    }
    case "letter": {
      if (source.trigger === "shipped_item" || source.trigger === "donated_item") {
        const verb = source.trigger === "shipped_item" ? "shipping" : "donating";
        const itemName =
          lookups.itemNames[source.triggerItemId as string] ?? titleCase(source.triggerItemId);
        const itemVis = lookups.itemVisibility[source.triggerItemId];
        const nameWithArticle = withIndefiniteArticle(itemName);
        const itemSegment: SourceSegment =
          itemVis && itemVis.type !== "always"
            ? { condition: itemVis, revealed: [nameWithArticle] }
            : nameWithArticle;
        return joinSegments(`Receive in a letter after ${verb} `, itemSegment);
      }
      const { day, season, year } = source.triggerDate;
      const dateStr = year
        ? `${formatDateLabel(season, day)}, Year ${String(year)}`
        : formatDateLabel(season, day);
      return [`Receive in a letter after reaching ${dateStr}`];
    }
    case "mine": {
      const biomeLabel = buildBiomeLabel(source.biomeId, lookups);
      return joinSegments("Mine in ", biomeLabel);
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
      const perk = lookups.perks[source.perkId as string];
      const perkName = perk?.name ?? titleCase(source.perkId);
      const skillName = perk ? (lookups.skillNames[perk.skillId] ?? titleCase(perk.skillId)) : "";
      const tierStr = perk ? ` (${skillName} tier ${String(perk.tier)})` : "";

      return [
        {
          condition: { perkId: source.perkId, type: "perkUnlocked" },
          revealed: joinSegments("Dig up in ", biomeLabel, `, with the ${perkName} perk${tierStr}`),
        },
      ];
    }

    case "monster": {
      const name = lookups.monsterNames[source.monsterId as string] ?? titleCase(source.monsterId);
      return [`Dropped by ${name}`];
    }
    case "monster_feed": {
      const name = lookups.monsterNames[source.monsterId as string] ?? titleCase(source.monsterId);
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
      const npcName = lookups.npcNames[source.npcId] ?? titleCase(source.npcId);
      return [`Propose to ${npcName}`];
    }
    case "quest":
      return buildQuestSegments(source, lookups);
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
      const qualifier = buildStoreQualifier(source.visibility, lookups, source.storeId);
      const bundleSegment: SourceSegment =
        lookups.recipeVisibility.type === "always"
          ? `the ${source.bundleName}`
          : { condition: lookups.recipeVisibility, revealed: [`the ${source.bundleName}`] };
      return joinSegments("Purchase ", bundleSegment, " from ", storeName, qualifier);
    }
    case "station": {
      const stationName =
        lookups.stationNames[source.stationId as string] ?? titleCase(source.stationId);
      return [`Process at ${stationName}`];
    }
    case "store": {
      const storeName = buildStoreName(source.storeId, lookups);
      const qualifier = buildStoreQualifier(source.visibility, lookups, source.storeId);
      return joinSegments("Purchase from ", storeName, qualifier);
    }
    case "treasure_chest": {
      const tierData = lookups.treasureChestTiers[source.tier as string];
      const name = tierData?.name ?? `${titleCase(source.tier)} Treasure Box`;
      return [`Fish up ${withIndefiniteArticle(name)}`];
    }
    case "tree": {
      const saplingName =
        lookups.itemNames[source.saplingItemId as string] ?? titleCase(source.saplingItemId);
      return [`Harvest from ${saplingName}`];
    }
    case "upgrade":
      return [upgradeSourceText(source)];
    case "wedding":
      return ["Receive after getting married"];
    case "wishing_well":
      return [`Obtain from the Wishing Well (${String(source.cost.amount)}t)`];
  }
}

export function buildStoreQualifier(
  sourceVisibility: undefined | VisibilityCondition,
  lookups: SegmentLookups,
  storeId: StoreId,
): SourceSegment[] {
  if (!sourceVisibility || sourceVisibility.type === "always") return [];

  const action = lookups.stores[storeId]?.upgradeAction ?? "upgrading";

  return [
    {
      condition: sourceVisibility,
      redacted: [" (after ", { redacted: true }, ")"],
      revealed: [` (after ${action})`],
    },
  ];
}

export function formatDateLabel(season: Season, day: number): string {
  return `${seasonLabel(season)} ${String(day)}`;
}

function buildCookingChallengeSegments(
  source: AcquisitionSource & { type: "quest" },
  lookups: SegmentLookups,
): [SourceSegment, ...SourceSegment[]] {
  const recipeName = source.challengeRecipeId
    ? (lookups.recipeNames[source.challengeRecipeId] ?? titleCase(source.challengeRecipeId))
    : (lookups.questNames[source.questId] ?? titleCase(source.questId));
  const questVis = source.visibility;
  const categoryVis = lookups.categoryVisibility.tali_challenges;

  const nameSegment: SourceSegment =
    questVis && questVis.type !== "always"
      ? { condition: questVis, revealed: [recipeName] }
      : recipeName;

  const inner = joinSegments("Complete the ", nameSegment, " cooking challenge");

  if (!categoryVis || categoryVis.type === "always") return inner;
  return [{ condition: categoryVis, revealed: inner }];
}

function buildCrownQuestSegments(
  source: AcquisitionSource & { type: "quest" },
  lookups: SegmentLookups,
): [SourceSegment, ...SourceSegment[]] {
  const questName = lookups.questNames[source.questId] ?? titleCase(source.questId);
  const subject = questName.replace(/^Crown Request:?\s*/, "");
  const questVis = source.visibility;
  const categoryVis = lookups.categoryVisibility.crown_quests;

  const subjectSegment: SourceSegment =
    questVis && questVis.type !== "always" ? { condition: questVis, revealed: [subject] } : subject;

  const inner = joinSegments("Complete the Crown Request for ", subjectSegment);

  if (!categoryVis || categoryVis.type === "always") return inner;
  return [{ condition: categoryVis, revealed: inner }];
}

function buildFetchQuestSegments(
  source: AcquisitionSource & { type: "quest" },
  lookups: SegmentLookups,
): [SourceSegment, ...SourceSegment[]] {
  const npcId = lookups.questNpcIds[source.questId];
  const npcName = npcId ? (lookups.npcNames[npcId] ?? titleCase(npcId)) : "???";
  const npcVis = npcId ? lookups.npcVisibility[npcId] : undefined;
  const questVis = source.visibility;

  const npcSegment: SourceSegment =
    npcVis && npcVis.type !== "always" ? { condition: npcVis, revealed: [npcName] } : npcName;

  const itemId = source.requestedItemId;
  const itemName = itemId ? (lookups.itemNames[itemId as string] ?? titleCase(itemId)) : "???";
  const itemSegment: SourceSegment =
    questVis && questVis.type !== "always"
      ? { condition: questVis, revealed: [itemName] }
      : itemName;

  return joinSegments("Complete ", npcSegment, "'s request for ", itemSegment);
}

function buildHeartQuestSegments(
  source: AcquisitionSource & { type: "quest" },
  lookups: SegmentLookups,
): [SourceSegment, ...SourceSegment[]] {
  const questName = lookups.questNames[source.questId] ?? titleCase(source.questId);
  const questVis = source.visibility;

  const npcId = lookups.questNpcIds[source.questId];
  const npcName = npcId ? (lookups.npcNames[npcId] ?? titleCase(npcId)) : "???";
  const npcVis = npcId ? lookups.npcVisibility[npcId] : undefined;

  const npcSegment: SourceSegment =
    npcVis && npcVis.type !== "always" ? { condition: npcVis, revealed: [npcName] } : npcName;
  const questSegment: SourceSegment =
    questVis && questVis.type !== "always"
      ? { condition: questVis, revealed: [questName] }
      : questName;

  return joinSegments("Complete ", npcSegment, "'s ", questSegment, " quest");
}

function buildLocationList(locationIds: LocationId[] | undefined, lookups: SegmentLookups): string {
  return (locationIds ?? [])
    .map((id) => lookups.locationNames[id as string] ?? titleCase(id))
    .join(", ");
}

function buildMissionQuestSegments(
  source: AcquisitionSource & { type: "quest" },
  lookups: SegmentLookups,
): [SourceSegment, ...SourceSegment[]] {
  const questName = lookups.questNames[source.questId] ?? titleCase(source.questId);
  const questVis = source.visibility;
  const categoryVis = lookups.categoryVisibility.stillwell_challenges;

  const nameSegment: SourceSegment =
    questVis && questVis.type !== "always"
      ? { condition: questVis, revealed: [questName] }
      : questName;

  const inner = joinSegments("Complete the ", nameSegment, " mission");

  if (!categoryVis || categoryVis.type === "always") return inner;
  return [{ condition: categoryVis, revealed: inner }];
}

function buildQuestSegments(
  source: AcquisitionSource & { type: "quest" },
  lookups: SegmentLookups,
): [SourceSegment, ...SourceSegment[]] {
  const questType = source.questType as string;

  switch (questType) {
    case "crown_quests":
      return buildCrownQuestSegments(source, lookups);
    case "fetch_quests":
      return buildFetchQuestSegments(source, lookups);
    case "heart_quests":
      return buildHeartQuestSegments(source, lookups);
    case "stillwell_challenges":
      return buildMissionQuestSegments(source, lookups);
    case "tali_challenges":
      return buildCookingChallengeSegments(source, lookups);
    default:
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
  source: AcquisitionSource & { type: "quest" },
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

function titleCase(s: string): string {
  return s
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function upgradeSourceText(source: AcquisitionSource & { type: "upgrade" }): string {
  const UPGRADE_TEXT: Record<string, string> = {
    "House Stairs": "Upgrade your home a fourth time",
    "Starter Farm Bridge": "Expand your farm",
  };
  return UPGRADE_TEXT[source.upgradeName] ?? `Purchase ${source.upgradeName}`;
}
