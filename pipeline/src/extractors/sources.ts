import type {
  Restriction,
  Season,
  Source,
  SourceType,
  TrackerData,
  Weather,
} from "$lib/types/tracker-data.js";

import {
  buildRequirementRegistry,
  parseRequirements,
  type RequirementExpr,
} from "../requirements.js";
import { sourceFileFor, type FiddleData } from "../parse-fiddle.js";

type SourceMap = Record<string, Source[]>;

export function extractSources(fiddle: FiddleData): TrackerData["sources"] {
  const map: SourceMap = {};

  // Build requirement registry once for all store processing
  const requirementsData = fiddle.requirements as Record<string, unknown> | undefined;
  const { named, primitives } = requirementsData
    ? buildRequirementRegistry(requirementsData)
    : { named: {}, primitives: new Set<string>() };

  extractStoreItems(fiddle, map, named, primitives);
  extractFishItems(fiddle, map);
  extractBugItems(fiddle, map);
  extractCraftingItems(fiddle, map);
  extractCropItems(fiddle, map);
  extractForageables(fiddle, map);
  extractCropSeasons(fiddle, map);
  extractMonsterDrops(fiddle, map);
  extractQuestRewards(fiddle, map);
  extractFestivalCosmetics(fiddle, map);
  extractRenownRewards(fiddle, map);

  let deduped = 0;
  for (const [itemId, sources] of Object.entries(map)) {
    const before = sources.length;
    map[itemId] = deduplicateSources(sources);
    deduped += before - map[itemId].length;
  }

  const totalItems = Object.keys(map).length;
  const totalSources = Object.values(map).reduce((n, s) => n + s.length, 0);
  console.log(
    `  Sources: ${totalItems} items with ${totalSources} sources (${deduped} duplicates removed)`,
  );

  return map as TrackerData["sources"];
}

function addSource(map: SourceMap, itemId: string, source: Source): void {
  if (!map[itemId]) map[itemId] = [];
  map[itemId].push(source);
}

function deduplicateSources(sources: Source[]): Source[] {
  const seen = new Set<string>();
  return sources.filter((s) => {
    const key = JSON.stringify(s);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractBugItems(fiddle: FiddleData, map: SourceMap): void {
  const bugs = fiddle.bugs as Record<string, Record<string, unknown>> | undefined;
  if (!bugs) return;

  for (const [bugId, data] of Object.entries(bugs)) {
    if (bugId === "default") continue;

    const restrictions: Restriction[] = [];

    const seasons = parseSeasonsArray(data.seasons);
    if (seasons) restrictions.push({ seasons, type: "season" });

    const weathers = parseWeathersArray(data.weather);
    if (weathers) restrictions.push({ type: "weather", weathers });

    const hours = parseHours(data.hours);
    if (hours) restrictions.push({ hours, type: "time" });

    const locations = parseStringArray(data.locations);
    const location = locations?.join(", ");

    addSource(map, bugId, {
      location,
      restrictions: restrictions.length > 0 ? restrictions : undefined,
      type: "bug_catch",
    });
  }
}

function extractCraftingItems(fiddle: FiddleData, map: SourceMap): void {
  const items = fiddle.items as
    | Record<string, Record<string, Record<string, Record<string, unknown>>>>
    | undefined;
  if (!items) return;

  const furniture = items.furniture;
  if (furniture) {
    for (const subCategory of Object.values(furniture)) {
      for (const [itemId, item] of Object.entries(subCategory)) {
        if (itemId === "default") continue;
        if (typeof item !== "object" || item === null) continue;
        if (item.recipe || item.recipe_key) {
          addSource(map, itemId, { type: "craft" });
        }
      }
    }
  }

  const other = items.other;
  if (other?.cooked_dishes) {
    for (const [itemId, item] of Object.entries(other.cooked_dishes)) {
      if (itemId === "default") continue;
      if (typeof item !== "object" || item === null) continue;
      if (item.recipe) {
        addSource(map, itemId, { type: "cook" });
      }
    }
  }
}

function extractCropItems(fiddle: FiddleData, map: SourceMap): void {
  const items = fiddle.items as
    | Record<string, Record<string, Record<string, Record<string, unknown>>>>
    | undefined;
  if (!items?.other?.crops_and_forage) return;

  for (const [itemId, item] of Object.entries(items.other.crops_and_forage)) {
    if (itemId === "default") continue;
    if (typeof item !== "object" || item === null) continue;

    const tags = Array.isArray(item.tags)
      ? (item.tags as unknown[]).filter((v): v is string => typeof v === "string")
      : [];

    if (tags.includes("seed")) {
      const seasons = parseSeasonsArray(item.seasons);
      addSource(map, itemId, {
        restrictions: seasons ? [{ seasons, type: "season" }] : undefined,
        type: "seed",
      });
    } else if (tags.includes("sapling")) {
      addSource(map, itemId, { type: "sapling" });
    }
  }
}

function extractCropSeasons(fiddle: FiddleData, map: SourceMap): void {
  const items = fiddle.items as
    | Record<string, Record<string, Record<string, Record<string, unknown>>>>
    | undefined;
  if (!items?.other?.crops_and_forage) return;

  const seedToCrop: Record<string, string> = {};
  for (const [itemId, item] of Object.entries(items.other.crops_and_forage)) {
    if (itemId === "default") continue;
    if (typeof item !== "object" || item === null) continue;

    const tags = Array.isArray(item.tags)
      ? (item.tags as unknown[]).filter((v): v is string => typeof v === "string")
      : [];
    const cropObject = item.crop_object as string | undefined;
    if (tags.includes("seed") && cropObject) {
      seedToCrop[itemId] = cropObject;
    }
  }

  let mapped = 0;
  for (const [seedId, cropId] of Object.entries(seedToCrop)) {
    const seedSources = map[seedId] ?? [];
    const seasonRestriction = seedSources
      .flatMap((s) => s.restrictions ?? [])
      .find((r) => r.type === "season");

    const restrictions: Restriction[] = seasonRestriction ? [seasonRestriction] : [];

    addSource(map, cropId, {
      restrictions: restrictions.length > 0 ? restrictions : undefined,
      type: "seed",
    });
    mapped++;
  }

  console.log(`  Crop seasons: ${mapped} crops mapped from seeds`);
}

function extractFestivalCosmetics(fiddle: FiddleData, map: SourceMap): void {
  const festivals = fiddle.festivals as Record<string, Record<string, unknown>> | undefined;
  if (!festivals) return;

  const seasonMap: Record<string, Season> = {
    fall: "fall",
    harvest: "fall",
    spring: "spring",
    summer: "summer",
    winter: "winter",
  };

  for (const [festivalId, fest] of Object.entries(festivals)) {
    if (festivalId === "default") continue;
    if (typeof fest !== "object" || fest === null) continue;

    const stocks = fest.stocks as Record<string, unknown> | undefined;
    if (!stocks) continue;

    const season = seasonMap[festivalId];

    for (const [storeId, stockData] of Object.entries(stocks)) {
      if (storeId === "default") continue;

      if (!Array.isArray(stockData)) continue;
      for (const entry of stockData) {
        if (typeof entry !== "object" || entry === null) continue;
        const obj = entry as Record<string, unknown>;

        const targetId = (obj.cosmetic as string) ?? (obj.item as string);
        if (!targetId) continue;

        const restrictions: Restriction[] = [];
        if (season) restrictions.push({ seasons: [season], type: "season" });

        addSource(map, targetId, {
          location: storeId,
          restrictions: restrictions.length > 0 ? restrictions : undefined,
          type: "festival",
        });
      }
    }
  }
}

function extractFishItems(fiddle: FiddleData, map: SourceMap): void {
  const fish = fiddle.fish as Record<string, Record<string, unknown>> | undefined;
  if (!fish) return;

  for (const [fishId, data] of Object.entries(fish)) {
    if (fishId === "default") continue;

    const itemId = (data.item as string | undefined) ?? fishId;
    const isChest = data.is_chest as boolean | undefined;

    const restrictions: Restriction[] = [];

    const seasons = parseSeasonsArray(data.seasons);
    if (seasons) restrictions.push({ seasons, type: "season" });

    const weathers = parseWeathersArray(data.weather);
    if (weathers) restrictions.push({ type: "weather", weathers });

    const hours = parseHours(data.hours);
    if (hours) restrictions.push({ hours, type: "time" });

    if (data.size && data.size !== "small") {
      restrictions.push({ size: data.size as string, type: "fishSize" });
    }

    let sourceType: SourceType = "fish";
    if (isChest) {
      sourceType = "chest";
    } else {
      const retrieval = data.retrieval;
      const retrievalArr = Array.isArray(retrieval)
        ? retrieval.filter((v): v is string => typeof v === "string")
        : typeof retrieval === "string"
          ? [retrieval]
          : [];
      if (retrievalArr.includes("divespot")) {
        sourceType = "dive";
      }
    }

    const waterType = data.water_type;
    const wtArr = Array.isArray(waterType)
      ? waterType.filter((v): v is string => typeof v === "string")
      : typeof waterType === "string"
        ? [waterType]
        : [];
    const location = wtArr.length > 0 ? wtArr.join(", ") : undefined;

    addSource(map, itemId, {
      location,
      restrictions: restrictions.length > 0 ? restrictions : undefined,
      type: sourceType,
    });
  }
}

function extractForageables(fiddle: FiddleData, map: SourceMap): void {
  const forageables = fiddle.forageables as Record<string, unknown> | undefined;
  if (!forageables) return;

  for (const [key, data] of Object.entries(forageables)) {
    if (["fall", "spring", "summer", "winter"].includes(key)) continue;
    if (!Array.isArray(data)) continue;
    for (const entry of data) {
      const itemId = typeof entry === "string" ? entry : undefined;
      if (!itemId) continue;
      addSource(map, itemId, { type: "forage" });
    }
  }

  const seasons: Season[] = ["spring", "summer", "fall", "winter"];
  for (const season of seasons) {
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
        if (!itemId) continue;

        addSource(map, itemId, {
          restrictions: [{ seasons: [season], type: "season" }],
          type: "forage",
        });
      }
    }
  }
}

function extractMonsterDrops(fiddle: FiddleData, map: SourceMap): void {
  const monsters = fiddle.monsters as Record<string, Record<string, unknown>> | undefined;
  if (!monsters) return;

  for (const [_monsterType, monstersOfType] of Object.entries(monsters)) {
    if (typeof monstersOfType !== "object" || monstersOfType === null) continue;

    for (const [monsterId, monster] of Object.entries(monstersOfType)) {
      if (monsterId === "default" || typeof monster !== "object" || monster === null) continue;

      const monsterData = monster as Record<string, unknown>;
      const drops = Array.isArray(monsterData.drops) ? monsterData.drops : [];

      for (const drop of drops) {
        if (typeof drop !== "object" || drop === null) continue;
        const itemId = (drop as Record<string, unknown>).item as string | undefined;
        if (!itemId) continue;

        addSource(map, itemId, {
          location: monsterId,
          type: "monster",
        });
      }
    }
  }
}

function extractQuestRewards(fiddle: FiddleData, map: SourceMap): void {
  const quests = fiddle.quests as Record<string, Record<string, unknown>> | undefined;
  if (!quests) return;

  for (const questGroup of Object.values(quests)) {
    if (typeof questGroup !== "object" || questGroup === null) continue;

    for (const [questId, quest] of Object.entries(questGroup)) {
      if (questId === "default" || typeof quest !== "object" || quest === null) continue;

      const questData = quest as Record<string, unknown>;
      const rewards = Array.isArray(questData.rewards) ? questData.rewards : [];

      for (const reward of rewards) {
        if (typeof reward !== "object" || reward === null) continue;
        const itemId = (reward as Record<string, unknown>).item as string | undefined;
        if (!itemId) continue;

        addSource(map, itemId, {
          location: questId,
          type: "quest",
        });
      }
    }
  }
}

function extractRenownRewards(fiddle: FiddleData, map: SourceMap): void {
  const renown = fiddle.renown as Record<string, unknown> | undefined;
  if (!renown) return;

  const rewards = Array.isArray(renown.rewards) ? renown.rewards : [];
  for (const reward of rewards) {
    if (typeof reward !== "object" || reward === null) continue;
    const obj = reward as Record<string, unknown>;
    const targetId = (obj.cosmetic as string) ?? (obj.item as string);
    if (!targetId) continue;

    addSource(map, targetId, { type: "renown" });
  }
}

function extractStoreItems(
  fiddle: FiddleData,
  map: SourceMap,
  namedRegistry: Record<string, Record<string, unknown>>,
  primitives: Set<string>,
): void {
  const stores = fiddle.stores as Record<string, Record<string, unknown>> | undefined;
  if (!stores) return;

  const storeSourceFile = sourceFileFor(fiddle, "stores");
  let ignoredScrolls = 0;

  for (const [storeId, store] of Object.entries(stores)) {
    if (storeId === "default") continue;
    const categories = Array.isArray(store.categories) ? store.categories : [];

    for (const category of categories) {
      if (typeof category !== "object" || category === null) continue;
      const cat = category as Record<string, unknown>;

      // Constant stock
      if (Array.isArray(cat.constant_stock)) {
        for (const entry of cat.constant_stock) {
          ignoredScrolls += processStoreEntry(
            entry,
            storeId,
            [],
            map,
            namedRegistry,
            primitives,
            storeSourceFile,
          );
        }
      }

      // Seasonal stock
      const seasonal = cat.seasonal as Record<string, unknown> | undefined;
      if (seasonal) {
        for (const [season, itemsData] of Object.entries(seasonal)) {
          if (!Array.isArray(itemsData)) continue;
          const seasonRestriction: Restriction = { seasons: [season as Season], type: "season" };
          for (const entry of itemsData) {
            ignoredScrolls += processStoreEntry(
              entry,
              storeId,
              [seasonRestriction],
              map,
              namedRegistry,
              primitives,
              storeSourceFile,
            );
          }
        }
      }

      // Random stock
      if (Array.isArray(cat.random_stock)) {
        const randomRestriction: Restriction = { type: "randomStock" };
        for (const entry of cat.random_stock) {
          ignoredScrolls += processStoreEntry(
            entry,
            storeId,
            [randomRestriction],
            map,
            namedRegistry,
            primitives,
            storeSourceFile,
          );
        }
      }
    }
  }

  if (ignoredScrolls > 0) {
    console.log(`  Stores: ${ignoredScrolls} recipe/crafting scrolls explicitly ignored`);
  }
}

function processStoreEntry(
  entry: unknown,
  storeId: string,
  baseRestrictions: Restriction[],
  map: SourceMap,
  namedRegistry: Record<string, Record<string, unknown>>,
  primitives: Set<string>,
  storeSourceFile: string,
): number {
  if (typeof entry === "string") {
    addSource(map, entry, {
      location: storeId,
      restrictions: baseRestrictions.length > 0 ? baseRestrictions : undefined,
      type: "store",
    });
    return 0;
  }

  if (typeof entry !== "object" || entry === null) return 0;
  const obj = entry as Record<string, unknown>;

  // Recipe/crafting scrolls are explicitly ignored
  if (obj.recipe_scroll || obj.crafting_scroll) return 1;

  const itemId = obj.item as string | undefined;
  const cosmeticId = obj.cosmetic as string | undefined;
  const targetId = itemId ?? cosmeticId;
  if (!targetId) return 0;

  const restrictions = [...baseRestrictions];

  // Parse requirements through the requirement system
  if (obj.requirements) {
    const reqRestrictions = mapRequirementsToRestrictions(
      obj.requirements,
      namedRegistry,
      primitives,
      storeId,
      targetId,
      storeSourceFile,
    );
    restrictions.push(...reqRestrictions);
  }

  addSource(map, targetId, {
    location: storeId,
    restrictions: restrictions.length > 0 ? restrictions : undefined,
    type: cosmeticId ? "store" : "store",
  });
  return 0;
}

function mapRequirementsToRestrictions(
  requirements: unknown,
  namedRegistry: Record<string, Record<string, unknown>>,
  primitives: Set<string>,
  storeId: string,
  entityId: string,
  storeSourceFile: string,
): Restriction[] {
  const ctx = { entity: `${storeId}/${entityId}`, field: "requirements", sourceFile: storeSourceFile };
  const expr = parseRequirements(requirements, namedRegistry, primitives, ctx);
  return flattenExprToRestrictions(expr);
}

function flattenExprToRestrictions(expr: RequirementExpr): Restriction[] {
  if ("all" in expr) {
    return expr.all.flatMap(flattenExprToRestrictions);
  }
  if ("any" in expr) {
    // Can't flatten OR into a flat restriction list — skip for now
    return [];
  }
  if ("not" in expr) {
    // Can't represent NOT in restrictions — skip
    return [];
  }
  if ("predicate" in expr) {
    return predicateToRestriction(expr.predicate, expr.value);
  }
  return [];
}

function predicateToRestriction(predicate: string, value: unknown): Restriction[] {
  switch (predicate) {
    case "has_perk":
      return [{ perk: value as string, type: "perk" }];
    case "reached_skill_level": {
      if (typeof value === "object" && value !== null) {
        const entries = Object.entries(value as Record<string, unknown>);
        if (entries.length === 1) {
          const [skill, level] = entries[0];
          return [{ level: level as number, skill, type: "skill" }];
        }
      }
      return [];
    }
    case "reached_mines_level":
      return [{ level: value as number, type: "minesLevel" }];
    case "is_season":
      return [{ seasons: [value as Season], type: "season" }];
    case "unlocked_animal":
      return [{ animal: value as string, type: "animal" }];
    case "seen_cutscene":
      return [{ cutscene: value as string, type: "cutscene" }];
    case "reached_date":
      if (typeof value === "string") {
        return [{ season: value as Season, type: "seenSeason" }];
      }
      if (typeof value === "object" && value !== null) {
        const dateObj = value as Record<string, unknown>;
        if (dateObj.season) {
          return [{ season: dateObj.season as Season, type: "seenSeason" }];
        }
      }
      return [];
    case "has_upper_floor":
      return [{ type: "upperFloor" }];
    case "is_dating_someone":
      return [{ relationship: "datingSomeone", type: "relationship" }];
    default:
      return [];
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

function parseWeathersArray(weathers: unknown): undefined | Weather[] {
  if (weathers === false || weathers === undefined || weathers === null) return undefined;
  if (Array.isArray(weathers)) {
    const arr = weathers.filter((v): v is string => typeof v === "string") as Weather[];
    return arr.length > 0 ? arr : undefined;
  }
  return undefined;
}
