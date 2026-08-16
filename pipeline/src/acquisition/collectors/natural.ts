import { simplifyAvailabilityCondition } from "$lib/engine/availability-condition.js";

import { forEachItem } from "../../extractor-helpers.js";

import type {
  ActivityId,
  AvailabilityCondition,
  LocationId,
  MonsterId,
  WaterType,
} from "$lib/types/acquisition.js";
import type {
  AnimalId,
  CosmeticId,
  FestivalId,
  ItemId,
  PerkId,
  Season,
  Weather,
} from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../../parse-fiddle.js";
import type { CosmeticSourceAccumulator, ItemSourceAccumulator } from "../source-accumulator.js";

export function collectNaturalSources(
  fiddle: ParsedGameData,
  accumulator: ItemSourceAccumulator,
  cosmeticAccumulator?: CosmeticSourceAccumulator,
): void {
  collectFishSources(fiddle, accumulator);
  collectBugSources(fiddle, accumulator);
  collectForageSources(fiddle, accumulator);
  collectCropSources(fiddle, accumulator);
  collectTreeSources(fiddle, accumulator);
  collectMonsterDropSources(fiddle, accumulator, cosmeticAccumulator);
  collectAnimalProductSources(fiddle, accumulator);
  collectEarthlyEssenceCosmeticSources(fiddle, cosmeticAccumulator);
  collectMistSightSources(fiddle, accumulator, cosmeticAccumulator);
  collectPumpkinPatchSources(fiddle, accumulator);
}

function buildNaturalAvailability(
  data: Record<string, unknown>,
): AvailabilityCondition | undefined {
  const conditions: AvailabilityCondition[] = [];

  const seasons = parseSeasonsArray(data.seasons);
  if (seasons) conditions.push({ seasons, type: "season" });

  const weathers = parseWeathersArray(data.weather);
  if (weathers) conditions.push({ type: "weather", weathers });

  const hours = parseHours(data.hours);
  if (hours) conditions.push({ start: hours[0], end: hours[1], type: "time" });

  if (conditions.length === 0) return undefined;
  if (conditions.length === 1) return simplifyAvailabilityCondition(conditions[0]);
  return simplifyAvailabilityCondition({ conditions, type: "all" });
}

function collectAnimalProductSources(
  fiddle: ParsedGameData,
  accumulator: ItemSourceAccumulator,
): void {
  forEachItem(fiddle, (itemId, item) => {
    const tags = Array.isArray(item.tags)
      ? (item.tags as unknown[]).filter((v): v is string => typeof v === "string")
      : [];

    if (tags.includes("animal_product")) {
      const animalId = item.animal_product as string | undefined;
      if (animalId) {
        accumulator.add(itemId as ItemId, {
          animalId: animalId as AnimalId,
          type: "animal_product",
        });
      }
    }
  });
}

function collectBugSources(fiddle: ParsedGameData, accumulator: ItemSourceAccumulator): void {
  const bugs = fiddle.bugs as Record<string, Record<string, unknown>> | undefined;
  if (!bugs) return;

  for (const [bugId, data] of Object.entries(bugs)) {
    if (bugId === "default" || typeof data !== "object" || data === null) continue;

    const availability = buildNaturalAvailability(data);
    const locations = parseStringArray(data.locations);
    const locationIds = locations?.map((l) => l as LocationId);

    accumulator.add(bugId as ItemId, {
      ...(availability ? { availability } : {}),
      ...(locationIds ? { locationIds } : {}),
      type: "bug_catch",
    });
  }
}

function collectCropSources(fiddle: ParsedGameData, accumulator: ItemSourceAccumulator): void {
  const items = fiddle.items as
    Record<string, Record<string, Record<string, Record<string, unknown>>>> | undefined;
  if (!items?.other?.crops_and_forage) return;

  const seedToCrop = new Map<string, string>();
  const seedSeasons = new Map<string, Season[]>();

  for (const [itemId, item] of Object.entries(items.other.crops_and_forage)) {
    if (itemId === "default" || typeof item !== "object" || item === null) continue;

    const tags = Array.isArray(item.tags)
      ? (item.tags as unknown[]).filter((v): v is string => typeof v === "string")
      : [];

    if (tags.includes("seed")) {
      const cropObject = item.crop_object as string | undefined;
      if (cropObject) {
        seedToCrop.set(itemId, cropObject);
        const seasons = parseSeasonsArray(item.seasons);
        if (seasons) seedSeasons.set(itemId, seasons);
      }
    }
  }

  for (const [seedId, cropId] of seedToCrop) {
    const seasons = seedSeasons.get(seedId);
    accumulator.add(cropId as ItemId, {
      ...(seasons ? { availability: { seasons, type: "season" as const } } : {}),
      seedItemId: seedId as ItemId,
      type: "crop",
    });
  }
}

function collectEarthlyEssenceCosmeticSources(
  fiddle: ParsedGameData,
  cosmeticAccumulator?: CosmeticSourceAccumulator,
): void {
  if (!cosmeticAccumulator) return;

  const misc = fiddle.misc as Record<string, unknown> | undefined;
  const earthlyEssence = misc?.earthly_essence as Record<string, unknown[]> | undefined;
  if (!earthlyEssence) return;

  for (const [season, entries] of Object.entries(earthlyEssence)) {
    if (!Array.isArray(entries)) continue;

    for (const entry of entries) {
      if (typeof entry !== "object" || entry === null) continue;
      const obj = entry as Record<string, unknown>;
      if (obj.item_id === "cosmetic" && typeof obj.inner_data === "string") {
        cosmeticAccumulator.add(obj.inner_data as CosmeticId, {
          activity: "crop_harvest" as const,
          availability: { seasons: [season as Season], type: "season" as const },
          perkId: "earthly_essence" as PerkId,
          type: "perk_drop",
        });
      }
    }
  }
}

function collectFishSources(fiddle: ParsedGameData, accumulator: ItemSourceAccumulator): void {
  const fish = fiddle.fish as Record<string, Record<string, unknown>> | undefined;
  if (!fish) return;

  for (const [fishId, data] of Object.entries(fish)) {
    if (fishId === "default" || typeof data !== "object" || data === null) continue;

    const isChest = data.is_chest as boolean | undefined;
    if (isChest) continue;

    const targetId = ((data.item as string | undefined) ?? fishId) as ItemId;

    const retrieval = data.retrieval;
    const retrievalArr = Array.isArray(retrieval)
      ? retrieval.filter((v): v is string => typeof v === "string")
      : typeof retrieval === "string"
        ? [retrieval]
        : [];

    const waterTypes = parseWaterTypes(data.water_type);

    if (retrievalArr.includes("divespot")) {
      accumulator.add(targetId, {
        type: "dive",
        ...(waterTypes ? { waterTypes } : {}),
      });
      continue;
    }

    if (retrievalArr.includes("fishtrap")) {
      accumulator.add(targetId, { type: "fish_trap" });
      continue;
    }

    const availability = buildNaturalAvailability(data);
    accumulator.add(targetId, {
      ...(availability ? { availability } : {}),
      type: "fish",
      ...(waterTypes ? { waterTypes } : {}),
    });
  }
}

function collectForageSources(fiddle: ParsedGameData, accumulator: ItemSourceAccumulator): void {
  const forageables = fiddle.forageables as Record<string, unknown> | undefined;
  if (!forageables) return;

  const SEASONS = new Set(["fall", "spring", "summer", "winter"]);

  for (const [key, data] of Object.entries(forageables)) {
    if (SEASONS.has(key)) continue;
    if (!Array.isArray(data)) continue;
    for (const entry of data) {
      const itemId = typeof entry === "string" ? entry : undefined;
      if (itemId) {
        accumulator.add(itemId as ItemId, { type: "forage" });
      }
    }
  }

  for (const season of SEASONS) {
    const seasonData = forageables[season] as Record<string, unknown> | undefined;
    if (!seasonData) continue;

    for (const rarityGroup of Object.values(seasonData)) {
      if (!Array.isArray(rarityGroup)) continue;
      for (const entry of rarityGroup) {
        const itemId =
          typeof entry === "string"
            ? entry
            : typeof entry === "object" && entry !== null
              ? ((entry as Record<string, unknown>).item as string | undefined)
              : undefined;
        if (itemId) {
          accumulator.add(itemId as ItemId, {
            availability: { seasons: [season as Season], type: "season" },
            type: "forage",
          });
        }
      }
    }
  }
}

function collectMistSightSources(
  fiddle: ParsedGameData,
  accumulator: ItemSourceAccumulator,
  cosmeticAccumulator?: CosmeticSourceAccumulator,
): void {
  const misc = fiddle.misc as Record<string, unknown> | undefined;
  const table = misc?.mist_sight_table;
  if (!Array.isArray(table)) return;

  for (const entry of table) {
    if (typeof entry !== "object" || entry === null) continue;
    const obj = entry as Record<string, unknown>;

    if (obj.item_id === "cosmetic" && typeof obj.inner_data === "string") {
      cosmeticAccumulator?.add(obj.inner_data as CosmeticId, {
        perkId: "mist_sight" as PerkId,
        type: "perk",
      });
    } else if (typeof obj.item_id === "string" && obj.item_id !== "unidentified_artifact") {
      accumulator.add(obj.item_id as ItemId, {
        perkId: "mist_sight" as PerkId,
        type: "perk",
      });
    }
  }
}

function collectMonsterDropSources(
  fiddle: ParsedGameData,
  accumulator: ItemSourceAccumulator,
  cosmeticAccumulator?: CosmeticSourceAccumulator,
): void {
  const monsters = fiddle.monsters as Record<string, Record<string, unknown>> | undefined;
  if (!monsters) return;

  for (const [, monstersOfType] of Object.entries(monsters)) {
    if (typeof monstersOfType !== "object" || monstersOfType === null) continue;

    for (const [monsterId, monster] of Object.entries(monstersOfType)) {
      if (monsterId === "default" || typeof monster !== "object" || monster === null) continue;

      const monsterData = monster as Record<string, unknown>;
      const drops = Array.isArray(monsterData.drops) ? monsterData.drops : [];

      for (const drop of drops) {
        if (typeof drop !== "object" || drop === null) continue;
        const dropObj = drop as Record<string, unknown>;
        const itemId = dropObj.item as string | undefined;
        if (itemId) {
          accumulator.add(itemId as ItemId, {
            monsterId: monsterId as MonsterId,
            type: "monster",
          });
        }
        const cosmeticId = dropObj.cosmetic as string | undefined;
        if (cosmeticId && cosmeticAccumulator) {
          cosmeticAccumulator.add(cosmeticId as CosmeticId, {
            monsterId: monsterId as MonsterId,
            type: "monster",
          });
        }
      }
    }
  }
}

function collectPumpkinPatchSources(
  fiddle: ParsedGameData,
  accumulator: ItemSourceAccumulator,
): void {
  const misc = fiddle.misc as Record<string, unknown> | undefined;
  const options = misc?.pumpkin_patch_options;
  if (!Array.isArray(options)) return;

  for (const entry of options) {
    if (typeof entry !== "object" || entry === null) continue;
    const itemId = (entry as Record<string, unknown>).item as string | undefined;
    if (itemId) {
      accumulator.add(itemId as ItemId, {
        activityId: "pumpkin_patch" as ActivityId,
        availability: { seasons: ["fall"], type: "season" as const },
        festivalId: "harvest" as FestivalId,
        type: "festival_activity",
      });
    }
  }
}

function collectTreeSources(fiddle: ParsedGameData, accumulator: ItemSourceAccumulator): void {
  const items = fiddle.items as
    Record<string, Record<string, Record<string, Record<string, unknown>>>> | undefined;
  if (!items?.other?.crops_and_forage) return;

  for (const [itemId, item] of Object.entries(items.other.crops_and_forage)) {
    if (itemId === "default" || typeof item !== "object" || item === null) continue;

    const tags = Array.isArray(item.tags)
      ? (item.tags as unknown[]).filter((v): v is string => typeof v === "string")
      : [];

    if (tags.includes("sapling")) {
      const treeProduct = item.tree_product as string | undefined;
      if (treeProduct) {
        accumulator.add(treeProduct as ItemId, {
          saplingItemId: itemId as ItemId,
          type: "tree",
        });
      }
    }
  }
}

function parseHours(hours: unknown): [number, number] | undefined {
  if (hours === false || hours === undefined || hours === null) return undefined;
  if (Array.isArray(hours) && hours.length >= 2) return [hours[0] as number, hours[1] as number];
  return undefined;
}

function parseSeasonsArray(seasons: unknown): Season[] | undefined {
  if (seasons === false || seasons === undefined || seasons === null) return undefined;
  if (Array.isArray(seasons)) {
    const arr = seasons.filter((v): v is string => typeof v === "string") as Season[];
    return arr.length > 0 ? arr : undefined;
  }
  return undefined;
}

function parseStringArray(data: unknown): string[] | undefined {
  if (data === false || data === undefined || data === null) return undefined;
  if (Array.isArray(data)) {
    const arr = data.filter((v): v is string => typeof v === "string");
    return arr.length > 0 ? arr : undefined;
  }
  return undefined;
}

function parseWaterTypes(waterType: unknown): undefined | WaterType[] {
  const arr = Array.isArray(waterType)
    ? waterType.filter((v): v is string => typeof v === "string")
    : typeof waterType === "string"
      ? [waterType]
      : [];
  return arr.length > 0 ? (arr as WaterType[]) : undefined;
}

function parseWeathersArray(weathers: unknown): undefined | Weather[] {
  if (weathers === false || weathers === undefined || weathers === null) return undefined;
  if (Array.isArray(weathers)) {
    const arr = weathers.filter((v): v is string => typeof v === "string") as Weather[];
    return arr.length > 0 ? arr : undefined;
  }
  return undefined;
}
