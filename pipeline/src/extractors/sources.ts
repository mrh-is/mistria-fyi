import type {
  Restriction,
  Season,
  Source,
  SourceType,
  TrackerData,
  Weather,
} from "$lib/types/tracker-data.js";

import type { FiddleData } from "../parse-fiddle.js";

/**
 * Extracts source data: WHERE and HOW to obtain each item.
 * This is the most complex extractor — it pulls from stores, fish, bugs,
 * artifacts, dungeons, items (crafting/cooking), and quests.
 */

type SourceMap = Record<string, Source[]>;

export function extractSources(fiddle: FiddleData): TrackerData["sources"] {
  const map: SourceMap = {};

  extractStoreItems(fiddle, map);
  extractFishItems(fiddle, map);
  extractBugItems(fiddle, map);
  extractCraftingItems(fiddle, map);
  extractCropItems(fiddle, map);
  extractForageables(fiddle, map);
  extractCropSeasons(fiddle, map);
  extractMonsterDrops(fiddle, map);
  extractQuestRewards(fiddle, map);

  // Deduplicate identical sources per item
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

/** Remove duplicate sources (same type, location, and restrictions). */
function deduplicateSources(sources: Source[]): Source[] {
  const seen = new Set<string>();
  return sources.filter((s) => {
    const key = JSON.stringify(s);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Map crop seasons: for each seed with a crop_object field, propagate the seed's
 * store season to the crop as a "grow" source. Also adds a "grow" source for
 * dual forageables (items that can be both foraged and grown from seed).
 */
function extractCropSeasons(fiddle: FiddleData, map: SourceMap): void {
  const items = fiddle.items as
    | Record<string, Record<string, Record<string, Record<string, unknown>>>>
    | undefined;
  if (!items?.other?.crops_and_forage) return;

  // Build seed → crop mapping + collect seed seasons from existing sources
  const seedToCrop: Record<string, string> = {};
  for (const [itemId, item] of Object.entries(items.other.crops_and_forage)) {
    if (itemId === "default") continue;
    if (typeof item !== "object" || item === null) continue;

    const tags = parseStringArray(item.tags);
    const cropObject = item.crop_object as string | undefined;
    if (tags?.includes("seed") && cropObject) {
      seedToCrop[itemId] = cropObject;
    }
  }

  // For each seed→crop pair, find the seed's season restriction and apply to crop
  let mapped = 0;
  for (const [seedId, cropId] of Object.entries(seedToCrop)) {
    const seedSources = map[seedId] ?? [];
    // Find any season restriction on the seed (from store seasonal stock)
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

  // Furniture items with recipes → craft
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

  // Cooked dishes → cook
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

    const tags = parseStringArray(item.tags);
    if (!tags) continue;

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

function extractFishItems(fiddle: FiddleData, map: SourceMap): void {
  const fish = fiddle.fish as Record<string, Record<string, unknown>> | undefined;
  if (!fish) return;

  for (const [fishId, data] of Object.entries(fish)) {
    if (fishId === "default") continue;

    const itemId = (data.item as string | undefined) ?? fishId;
    const isChest = data.is_chest as boolean | undefined;
    const retrieval = data.retrieval;
    const retrievalArr = parseStringArray(retrieval);

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

    // Determine source type
    let sourceType: SourceType = "fish";
    if (isChest) {
      sourceType = "chest";
    } else if (retrievalArr?.includes("divespot") || retrieval === "divespot") {
      sourceType = "dive";
    }

    const waterType = data.water_type;
    const wtArr = parseStringArray(waterType);
    const location = wtArr
      ? wtArr.join(", ")
      : typeof waterType === "string"
        ? waterType
        : undefined;

    addSource(map, itemId, {
      location,
      restrictions: restrictions.length > 0 ? restrictions : undefined,
      type: sourceType,
    });
  }
}

// ─── Store items ────────────────────────────────────────────────────

function extractForageables(fiddle: FiddleData, map: SourceMap): void {
  const forageables = fiddle.forageables as Record<string, unknown> | undefined;
  if (!forageables) return;

  // Non-seasonal forageables (e.g., sand_forageables = beach shells)
  for (const [key, data] of Object.entries(forageables)) {
    if (["spring", "summer", "fall", "winter"].includes(key)) continue;
    const items = toArray<unknown>(data);
    for (const entry of items) {
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
      const rarityItems = toArray<unknown>(rarityGroup);
      for (const entry of rarityItems) {
        // Entries can be plain strings ("heather") or objects ({ item: "heather" })
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

// ─── Fish ───────────────────────────────────────────────────────────

function extractMonsterDrops(fiddle: FiddleData, map: SourceMap): void {
  const monsters = fiddle.monsters as Record<string, Record<string, unknown>> | undefined;
  if (!monsters) return;

  for (const [_monsterType, monstersOfType] of Object.entries(monsters)) {
    if (typeof monstersOfType !== "object" || monstersOfType === null) continue;

    for (const [monsterId, monster] of Object.entries(monstersOfType)) {
      if (monsterId === "default" || typeof monster !== "object" || monster === null) continue;

      const monsterData = monster as Record<string, unknown>;
      const drops = toArray<Record<string, unknown>>(monsterData.drops);

      for (const drop of drops) {
        if (typeof drop !== "object" || drop === null) continue;
        const itemId = drop.item as string | undefined;
        if (!itemId) continue;

        addSource(map, itemId, {
          location: monsterId,
          type: "monster",
        });
      }
    }
  }
}

// ─── Bugs ───────────────────────────────────────────────────────────

function extractQuestRewards(fiddle: FiddleData, map: SourceMap): void {
  const quests = fiddle.quests as Record<string, Record<string, unknown>> | undefined;
  if (!quests) return;

  for (const questGroup of Object.values(quests)) {
    if (typeof questGroup !== "object" || questGroup === null) continue;

    for (const [questId, quest] of Object.entries(questGroup)) {
      if (questId === "default" || typeof quest !== "object" || quest === null) continue;

      const questData = quest as Record<string, unknown>;
      const rewards = toArray<Record<string, unknown>>(questData.rewards);

      for (const reward of rewards) {
        if (typeof reward !== "object" || reward === null) continue;
        const itemId = reward.item as string | undefined;
        if (!itemId) continue;

        addSource(map, itemId, {
          location: questId,
          type: "quest",
        });
      }
    }
  }
}

// ─── Crafting & Cooking ─────────────────────────────────────────────

function extractStoreItems(fiddle: FiddleData, map: SourceMap): void {
  const stores = fiddle.stores as Record<string, Record<string, unknown>> | undefined;
  if (!stores) return;

  for (const [storeId, store] of Object.entries(stores)) {
    const categories = toArray<Record<string, unknown>>(store.categories);
    if (categories.length === 0) continue;

    for (const category of categories) {
      if (typeof category !== "object" || category === null) continue;

      // Constant stock
      const constantStock = toArray(category.constant_stock);
      for (const entry of constantStock) {
        const itemId = typeof entry === "string" ? entry : (entry as Record<string, unknown>)?.item;
        if (typeof itemId !== "string") continue;

        const restrictions: Restriction[] = [];
        if (typeof entry === "object" && entry !== null) {
          const obj = entry as Record<string, unknown>;
          if (obj.building_fixed) {
            restrictions.push({ building: obj.building_fixed as string, type: "building" });
          }
          if (obj.has_perk) {
            restrictions.push({ perk: obj.has_perk as string, type: "perk" });
          }
          if (obj.skill_level_at_least) {
            const skill = obj.skill_level_at_least as Record<string, unknown>;
            restrictions.push({
              level: skill.level as number,
              skill: skill.skill as string,
              type: "skill",
            });
          }
        }

        addSource(map, itemId, {
          location: storeId,
          restrictions: restrictions.length > 0 ? restrictions : undefined,
          type: "store",
        });
      }

      // Seasonal stock
      const seasonal = category.seasonal as Record<string, unknown> | undefined;
      if (seasonal) {
        for (const [season, itemsData] of Object.entries(seasonal)) {
          const items = toArray(itemsData);
          for (const entry of items) {
            const itemId =
              typeof entry === "string" ? entry : (entry as Record<string, unknown>)?.item;
            if (typeof itemId !== "string") continue;

            const restrictions: Restriction[] = [{ seasons: [season as Season], type: "season" }];
            if (typeof entry === "object" && entry !== null) {
              const obj = entry as Record<string, unknown>;
              if (obj.building_fixed) {
                restrictions.push({ building: obj.building_fixed as string, type: "building" });
              }
            }

            addSource(map, itemId, {
              location: storeId,
              restrictions,
              type: "store",
            });
          }
        }
      }

      // Random stock
      const randomStock = toArray(category.random_stock);
      for (const entry of randomStock) {
        const itemId = typeof entry === "string" ? entry : (entry as Record<string, unknown>)?.item;
        if (typeof itemId !== "string") continue;

        addSource(map, itemId, {
          location: storeId,
          restrictions: [{ type: "randomStock" }],
          type: "store",
        });
      }
    }
  }
}

// ─── Crops & Seeds ──────────────────────────────────────────────────

function parseHours(hours: unknown): [number, number] | undefined {
  if (hours === false || hours === undefined || hours === null) return undefined;
  const arr = toArray<number>(hours);
  return arr.length >= 2 ? [arr[0], arr[1]] : undefined;
}

// ─── Forageables ────────────────────────────────────────────────────

function parseSeasonsArray(seasons: unknown): Season[] | undefined {
  if (seasons === false || seasons === undefined || seasons === null) return undefined;
  const arr = toArray<string>(seasons);
  return arr.length > 0 ? (arr as Season[]) : undefined;
}

// ─── Monster drops ──────────────────────────────────────────────────

function parseStringArray(data: unknown): string[] | undefined {
  if (data === false || data === undefined || data === null) return undefined;
  const arr = toArray<string>(data);
  return arr.length > 0 ? arr : undefined;
}

// ─── Quest rewards ──────────────────────────────────────────────────

function parseWeathersArray(weathers: unknown): undefined | Weather[] {
  if (weathers === false || weathers === undefined || weathers === null) return undefined;
  const arr = toArray<string>(weathers);
  return arr.length > 0 ? (arr as Weather[]) : undefined;
}

// ─── Main export ────────────────────────────────────────────────────

/** Convert array or numbered-key object (from flat parser) to array. */
function toArray<T = unknown>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const keys = Object.keys(obj);
    // Only treat as array if keys look numeric
    if (keys.length > 0 && keys.every((k) => /^\d+$/.test(k))) {
      return keys.sort((a, b) => Number(a) - Number(b)).map((k) => obj[k] as T);
    }
  }
  return [];
}
