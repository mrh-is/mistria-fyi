import { simplifyAvailabilityCondition } from "$lib/engine/availability-condition.js";
import { isNonEmptyArray, type NonEmptyArray } from "$lib/utils.js";

import { forEachItem } from "../../extractor-helpers";

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
  MinesBiomeId,
  PerkId,
  Season,
  Weather,
} from "$lib/types/tracker-data.js";
import type { PetCosmeticSetId } from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../../parse-fiddle";
import type {
  CosmeticSourceAccumulator,
  ItemSourceAccumulator,
  PetCosmeticSourceAccumulator,
} from "../source-accumulator";

export function collectNaturalSources(
  fiddle: ParsedGameData,
  accumulator: ItemSourceAccumulator,
  cosmeticAccumulator?: CosmeticSourceAccumulator,
  petCosmeticAccumulator?: PetCosmeticSourceAccumulator,
): void {
  collectFishSources(fiddle, accumulator);
  collectBugSources(fiddle, accumulator);
  collectForageSources(fiddle, accumulator);
  collectMineForageableSources(fiddle, accumulator);
  collectCropSources(fiddle, accumulator);
  collectTreeSources(fiddle, accumulator);
  collectMonsterDropSources(fiddle, accumulator, cosmeticAccumulator, petCosmeticAccumulator);
  collectAnimalProductSources(fiddle, accumulator);
  collectGoldenAnimalProductSources(fiddle, accumulator);
  collectEarthlyEssenceCosmeticSources(fiddle, cosmeticAccumulator);
  collectMistSightSources(fiddle, accumulator, cosmeticAccumulator);
  collectPumpkinPatchSources(fiddle, accumulator);
}

function buildNaturalAvailability(
  data: Record<string, unknown>,
): AvailabilityCondition | undefined {
  const conditions: AvailabilityCondition[] = [];

  const seasons = parseSeasonsArray(data.seasons);
  if (seasons) conditions.push({ type: "season", seasons });

  const weathers = parseWeathersArray(data.weather);
  if (weathers) conditions.push({ type: "weather", weathers });

  const hours = parseHours(data.hours);
  if (hours) conditions.push({ type: "time", start: hours[0], end: hours[1] });

  if (conditions.length === 0) return undefined;
  if (conditions.length === 1) return simplifyAvailabilityCondition(conditions[0]);
  return simplifyAvailabilityCondition({
    type: "all",
    conditions: conditions as NonEmptyArray<AvailabilityCondition>,
  });
}

const MINE_SUBCAT_TO_BIOME: Record<string, MinesBiomeId> = {
  deep_earth: "deep_earth" as MinesBiomeId,
  lava_caves: "lava_caves" as MinesBiomeId,
  ruins: "ancient_ruins" as MinesBiomeId,
  tide_caverns: "tide_caverns" as MinesBiomeId,
  upper_mines: "upper_mines" as MinesBiomeId,
};

function collectAnimalProductSources(
  fiddle: ParsedGameData,
  accumulator: ItemSourceAccumulator,
): void {
  forEachItem(fiddle, (itemId, item) => {
    const tags = Array.isArray(item.tags)
      ? (item.tags as unknown[]).filter((v): v is string => typeof v === "string")
      : [];

    if (tags.includes("animal_product")) {
      const animalId = item.animal_product as AnimalId | undefined;
      if (animalId) {
        accumulator.add(itemId as ItemId, {
          type: "animal_product",
          animalId,
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
      ...(locationIds && isNonEmptyArray(locationIds) ? { locationIds } : {}),
      type: "bug_catch",
    });
  }
}

function collectCropSources(fiddle: ParsedGameData, accumulator: ItemSourceAccumulator): void {
  const items = fiddle.items as
    Record<string, Record<string, Record<string, Record<string, unknown>>>> | undefined;
  if (!items?.other?.crops_and_forage) return;

  const seedToCrop = new Map<string, string>();
  const seedSeasons = new Map<string, NonEmptyArray<Season>>();

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
      ...(seasons ? { availability: { type: "season" as const, seasons } } : {}),
      type: "crop",
      seedItemId: seedId as ItemId,
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
          type: "perk_drop",
          activity: "crop_harvest" as const,
          availability: { type: "season" as const, seasons: [season as Season] },
          perkId: "earthly_essence" as PerkId,
        });
      }
    }
  }
}

const RARITY_ORDER = [
  "junk",
  "ultra_common",
  "very_very_common",
  "very_common",
  "common",
  "uncommon",
  "rare",
  "very_rare",
] as const;

interface BaitRange {
  itemId: ItemId;
  maxIdx: number;
  minIdx: number;
}

type FishRarity = (typeof RARITY_ORDER)[number];

export function buildBaitRanges(fiddle: ParsedGameData): BaitRange[] {
  const items = fiddle.items as
    Record<string, Record<string, Record<string, Record<string, unknown>>>> | undefined;
  const baits = items?.other?.apiaries_and_terrariums;
  if (!baits) return [];

  const ranges: BaitRange[] = [];
  for (const [itemId, item] of Object.entries(baits)) {
    if (typeof item !== "object" || item === null) continue;
    const tags = Array.isArray(item.tags)
      ? (item.tags as unknown[]).filter((v): v is string => typeof v === "string")
      : [];
    if (!tags.includes("fish_bait")) continue;

    const attract = item.attract as Record<string, unknown> | undefined;
    if (!attract) continue;

    const minRarity = attract.min_rarity;
    const maxRarity = attract.max_rarity;
    if (typeof maxRarity !== "string") continue;

    const minIdx = typeof minRarity === "number" ? 0 : rarityIndex(minRarity as string);
    const maxIdx = rarityIndex(maxRarity);

    ranges.push({ itemId: itemId as ItemId, maxIdx, minIdx });
  }
  return ranges;
}

export function buildFishBiomeMap(fiddle: ParsedGameData): Map<string, MinesBiomeId> {
  const dungeons = fiddle.dungeons as Record<string, unknown> | undefined;
  const dungeonsInner = dungeons?.dungeons as Record<string, unknown> | undefined;
  const rawBiomes = dungeonsInner?.biomes;
  if (!Array.isArray(rawBiomes)) return new Map();

  const map = new Map<string, MinesBiomeId>();
  for (const biome of rawBiomes) {
    if (typeof biome !== "object" || biome === null) continue;
    const b = biome as Record<string, unknown>;
    const name = b.name as string | undefined;
    if (!name) continue;

    const biomeId = name
      .replace(/^The\s+/i, "")
      .toLowerCase()
      .replace(/\s+/g, "_") as MinesBiomeId;

    const votes = b.votes as Record<string, unknown> | undefined;
    const fishEntries = votes?.fish;
    if (!Array.isArray(fishEntries)) continue;
    for (const entry of fishEntries) {
      if (typeof entry !== "object" || entry === null) continue;
      const obj = entry as Record<string, unknown>;
      const fishObj = obj.object as string | undefined;
      if (fishObj) map.set(fishObj, biomeId);
    }
  }
  return map;
}

function collectFishSources(fiddle: ParsedGameData, accumulator: ItemSourceAccumulator): void {
  const fish = fiddle.fish as Record<string, Record<string, unknown>> | undefined;
  if (!fish) return;

  const baitRanges = buildBaitRanges(fiddle);
  const fishBiomeMap = buildFishBiomeMap(fiddle);

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

    const methods = new Set(retrievalArr.length > 0 ? retrievalArr : ["fishing"]);
    const isBaitOnly = data.bait_only === true;
    const rarity = data.rarity as string | undefined;

    if (isBaitOnly) {
      if (!methods.has("fishing") || !methods.has("mines")) {
        throw new Error(
          `bait_only fish "${fishId}" has unexpected retrieval [${[...methods].join(", ")}]; expected ["fishing", "mines"]`,
        );
      }
      if (!rarity) throw new Error(`bait_only fish "${fishId}" is missing a rarity`);
      const baitItemIds = matchingBaitItemIds(rarity, baitRanges);
      if (baitItemIds.length === 0) {
        throw new Error(`bait_only fish "${fishId}" (rarity "${rarity}") matches no bait items`);
      }
      accumulator.add(targetId, {
        type: "bait_fish",
        baitItemIds: baitItemIds as NonEmptyArray<ItemId>,
      });
      continue;
    }

    if (methods.has("fish_trap")) {
      if (methods.size !== 1) {
        throw new Error(
          `fish_trap fish "${fishId}" has unexpected extra retrieval methods: [${[...methods].join(", ")}]`,
        );
      }
      if (!rarity) throw new Error(`fish_trap fish "${fishId}" is missing a rarity`);
      const baitItemIds = matchingBaitItemIds(rarity, baitRanges);
      if (baitItemIds.length === 0) {
        throw new Error(`fish_trap fish "${fishId}" (rarity "${rarity}") matches no bait items`);
      }
      accumulator.add(targetId, {
        type: "fish_trap",
        baitItemIds: baitItemIds as NonEmptyArray<ItemId>,
      });
      continue;
    }

    if (methods.has("mines")) {
      if (methods.size !== 1) {
        throw new Error(
          `mines fish "${fishId}" has unexpected extra retrieval methods: [${[...methods].join(", ")}]`,
        );
      }
      const biomeId = fishBiomeMap.get(fishId);
      accumulator.add(targetId, {
        type: "mine_fish",
        ...(biomeId ? { biomeId } : {}),
      });
      continue;
    }

    const waterTypes = parseWaterTypes(data.water_type);
    const availability = buildNaturalAvailability(data);

    if (methods.has("fishing")) {
      accumulator.add(targetId, {
        ...(availability ? { availability } : {}),
        type: "fish",
        ...(waterTypes ? { waterTypes } : {}),
      });
    }

    if (methods.has("divespot")) {
      accumulator.add(targetId, {
        type: "dive",
        ...(waterTypes ? { waterTypes } : {}),
      });
    }

    const unknownMethods = [...methods].filter((m) => m !== "fishing" && m !== "divespot");
    if (unknownMethods.length > 0) {
      throw new Error(
        `fish "${fishId}" has unknown retrieval methods: [${unknownMethods.join(", ")}]`,
      );
    }
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
            type: "forage",
            availability: { type: "season", seasons: [season as Season] },
          });
        }
      }
    }
  }
}

function collectGoldenAnimalProductSources(
  fiddle: ParsedGameData,
  accumulator: ItemSourceAccumulator,
): void {
  const GOLDEN_PRODUCT_TO_ANIMAL: Record<string, string> = {
    animal_currency: "chicken",
    bull_horn: "cow",
    golden_alpaca_wool: "alpaca",
    golden_bristle: "horse",
    golden_cow_milk: "cow",
    golden_duck_egg: "duck",
    golden_duck_feather: "duck",
    golden_egg: "chicken",
    golden_feather: "chicken",
    golden_horse_hair: "horse",
    golden_rabbit_wool: "rabbit",
    golden_sheep_wool: "sheep",
  };

  forEachItem(fiddle, (itemId, item) => {
    const animalType = GOLDEN_PRODUCT_TO_ANIMAL[itemId];
    if (!animalType) return;

    const tags = Array.isArray(item.tags)
      ? (item.tags as unknown[]).filter((v): v is string => typeof v === "string")
      : [];
    if (!tags.includes("animal_product")) return;

    accumulator.add(itemId as ItemId, {
      type: "animal_product",
      animalId: animalType as AnimalId,
    });
  });
}

function collectMineForageableSources(
  fiddle: ParsedGameData,
  accumulator: ItemSourceAccumulator,
): void {
  forEachItem(fiddle, (itemId, item, topCat, subCat) => {
    const tags = Array.isArray(item.tags)
      ? (item.tags as unknown[]).filter((v): v is string => typeof v === "string")
      : [];

    if (!tags.includes("mines_forageable")) return;

    const biomeId = topCat === "mines" ? MINE_SUBCAT_TO_BIOME[subCat] : undefined;
    if (!biomeId) {
      console.warn(
        `  Warning: mines_forageable "${itemId}" has no biome mapping (${topCat}/${subCat})`,
      );
      return;
    }

    accumulator.add(itemId as ItemId, { type: "mine", biomeId });
  });
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
        type: "perk",
        perkId: "mist_sight" as PerkId,
      });
    } else if (typeof obj.item_id === "string" && obj.item_id !== "unidentified_artifact") {
      accumulator.add(obj.item_id as ItemId, {
        type: "perk",
        perkId: "mist_sight" as PerkId,
      });
    }
  }
}

function collectMonsterDropSources(
  fiddle: ParsedGameData,
  accumulator: ItemSourceAccumulator,
  cosmeticAccumulator?: CosmeticSourceAccumulator,
  petCosmeticAccumulator?: PetCosmeticSourceAccumulator,
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
        const itemId = dropObj.item as ItemId | undefined;
        if (itemId) {
          accumulator.add(itemId, {
            type: "monster",
            monsterId: monsterId as MonsterId,
          });
        }
        const cosmeticId = dropObj.cosmetic as CosmeticId | undefined;
        if (cosmeticId && cosmeticAccumulator) {
          cosmeticAccumulator.add(cosmeticId, {
            type: "monster",
            monsterId: monsterId as MonsterId,
          });
        }
        const petCosmeticId = dropObj.pet_cosmetic as PetCosmeticSetId | undefined;
        if (petCosmeticId && petCosmeticAccumulator) {
          petCosmeticAccumulator.add(petCosmeticId, {
            type: "monster",
            monsterId: monsterId as MonsterId,
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
    const itemId = (entry as Record<string, unknown>).item as ItemId | undefined;
    if (itemId) {
      accumulator.add(itemId, {
        type: "festival_activity",
        activityId: "pumpkin_patch" as ActivityId,
        availability: { type: "season" as const, seasons: ["fall"] },
        festivalId: "harvest" as FestivalId,
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
      const treeProduct = item.tree_product as ItemId | undefined;
      if (treeProduct) {
        accumulator.add(treeProduct, {
          type: "tree",
          saplingItemId: itemId as ItemId,
        });
      }
    }
  }
}

function matchingBaitItemIds(rarity: string, baitRanges: BaitRange[]): ItemId[] {
  const idx = rarityIndex(rarity);
  return baitRanges.filter((b) => idx >= b.minIdx && idx <= b.maxIdx).map((b) => b.itemId);
}

function parseHours(hours: unknown): [number, number] | undefined {
  if (hours === false || hours === undefined || hours === null) return undefined;
  if (Array.isArray(hours) && hours.length >= 2) return [hours[0] as number, hours[1] as number];
  return undefined;
}

function parseSeasonsArray(seasons: unknown): NonEmptyArray<Season> | undefined {
  if (seasons === false || seasons === undefined || seasons === null) return undefined;
  if (Array.isArray(seasons)) {
    const arr = seasons.filter((v): v is string => typeof v === "string") as Season[];
    if (arr.length === 0) return undefined;
    if (arr.length === 4) return undefined;
    return arr as NonEmptyArray<Season>;
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

function parseWaterTypes(waterType: unknown): NonEmptyArray<WaterType> | undefined {
  const arr = Array.isArray(waterType)
    ? waterType.filter((v): v is string => typeof v === "string")
    : typeof waterType === "string"
      ? [waterType]
      : [];
  if (arr.length === 0) return undefined;
  if (arr.length === 3) return undefined;
  return arr as NonEmptyArray<WaterType>;
}

function parseWeathersArray(weathers: unknown): undefined | Weather[] {
  if (weathers === false || weathers === undefined || weathers === null) return undefined;
  if (Array.isArray(weathers)) {
    const arr = weathers.filter((v): v is string => typeof v === "string") as Weather[];
    return arr.length > 0 ? arr : undefined;
  }
  return undefined;
}

function rarityIndex(rarity: string): number {
  const idx = RARITY_ORDER.indexOf(rarity as FishRarity);
  if (idx === -1) throw new Error(`Unknown fish rarity "${rarity}"`);
  return idx;
}
