import type {
  AcquisitionSource,
  BiomeId,
  RecipeId,
  Season,
  StoreId,
  TrackerData,
  Weather,
} from "$lib/types/tracker-data.js";
import type { VisibilityCondition } from "$lib/types/visibility.js";

const SEASON_LABEL: Record<Season, string> = {
  fall: "Fall",
  spring: "Spring",
  summer: "Summer",
  winter: "Winter",
};

/** Season-specific weather display names */
const WEATHER_LABEL_BY_SEASON: Record<Season, Partial<Record<Weather, string>>> = {
  fall: {},
  spring: {},
  summer: {},
  winter: {
    heavy_inclement: "Blizzard",
    inclement: "Snow",
  },
};

const WEATHER_LABEL: Record<Weather, string> = {
  calm: "Sun",
  heavy_inclement: "Storm",
  inclement: "Rain",
  special: "Breeze",
};

export interface RecipeSourceLookups {
  biomes: TrackerData["mines"]["biomes"];
  festivals: Partial<Record<string, { name: string }>>;
  itemNames: Partial<Record<string, string>>;
  perks: Partial<
    Record<
      string,
      {
        name: string;
        skillId: string;
        tier: number;
        visibility?: VisibilityCondition;
      }
    >
  >;
  perkTierLevels: number[];
  questNames: Partial<Record<string, string>>;
  recipeNames: Partial<Record<RecipeId, string>>;
  redactedStoreIds?: ReadonlySet<string>;
  skillNames: Partial<Record<string, string>>;
  stores: Partial<Record<string, { article?: "the"; name: string; upgradeAction?: string }>>;
  treasureChestTiers: Partial<Record<string, { name: string }>>;
}

/** Shorten repetitive quest name prefixes */
export function displayQuestName(name: string, questType: string): string {
  if (questType === "fetch_quests") {
    // "Request for a {item}" / "Request for {item}" → "{item}"
    // "Important Request for a Moon Fruit" → "Moon Fruit (Important)"
    if (name.startsWith("Important ")) {
      return `${name.replace(/^Important Request [Ff]or (an? )?/, "")} (Important)`;
    }
    return name.replace(/^Request [Ff]or (an? )?/, "");
  }
  if (questType === "crown_quests") {
    // "Crown Request: {item}" or "Crown Request {item}" → "{item}"
    return name.replace(/^Crown Request:?\s*/, "");
  }
  return name;
}

export function formatBiomeName(biomeId: BiomeId, biomes: TrackerData["mines"]["biomes"]): string {
  const biome = biomes.find((b) => b.id === biomeId);
  if (!biome) return titleCase(biomeId);
  if (biome.name.startsWith("The ")) return `the ${biome.name.slice(4)}`;
  return `the ${biome.name}`;
}

export function formatStoreName(
  storeId: StoreId,
  stores: Partial<Record<StoreId, { article?: "the"; name: string }>>,
): string {
  const store = stores[storeId];
  if (!store) return titleCase(storeId);
  return store.article ? `${store.article} ${store.name}` : store.name;
}

export function recipeSourceLabel(source: AcquisitionSource, lookups: RecipeSourceLookups): string {
  switch (source.type) {
    case "animal_product":
      return "Obtain from an animal product";
    case "artifact_dig":
      return "Dig up at an artifact dig site";
    case "artifact_replicator":
      return "Replicate at the Artifact Replicator";
    case "beach_cave_chest":
      return "Find in the Gold Treasure Chest in the Beach Cave";
    case "bug_catch":
      return "Catch as a bug";
    case "chicken_statue":
      return `Obtain from the Chicken Statue (${String(source.cost.amount)} beads)`;
    case "crop":
      return "Grow as a crop";
    case "date":
      return "Receive on a scheduled date";
    case "default":
      return "Available from the start";
    case "dive":
      return "Find while diving";
    case "engagement":
      return "Receive from Elsie after getting to 10 hearts with a dateable character";
    case "equipment":
      return "Obtain as equipment";
    case "festival": {
      const festivalName =
        lookups.festivals[source.festivalId]?.name ?? titleCase(source.festivalId);
      const storeName = source.storeId ? resolveStoreName(source.storeId, lookups) : undefined;
      return storeName
        ? `Purchase from ${storeName} at the ${festivalName}`
        : `Obtain at the ${festivalName}`;
    }
    case "festival_activity":
      return "Complete a festival activity";
    case "fish":
      return "Catch while fishing";
    case "fish_trap":
      return "Find in a fish trap";
    case "forage":
      return "Forage in the wild";
    case "letter": {
      if (source.trigger === "shipped_item") {
        const name = lookups.itemNames[source.triggerItemId] ?? titleCase(source.triggerItemId);
        return `Receive in a letter after shipping ${withIndefiniteArticle(name)}`;
      }
      if (source.trigger === "donated_item") {
        const name = lookups.itemNames[source.triggerItemId] ?? titleCase(source.triggerItemId);
        return `Receive in a letter after donating ${withIndefiniteArticle(name)}`;
      }
      const { day, season, year } = source.triggerDate;
      const seasonName = seasonLabel(season);
      const dateStr = year
        ? `${seasonName} ${String(day)}, Year ${String(year)}`
        : `${seasonName} ${String(day)}`;
      return `Receive in a letter after reaching ${dateStr}`;
    }
    case "mine":
      return "Mine in the Mines";
    case "mines_chest": {
      const biomeName = formatBiomeName(source.biomeId, lookups.biomes);
      const biome = lookups.biomes.find((b) => b.id === source.biomeId);
      const floorRange = biome
        ? `floors ${String(biome.startFloor)}–${String(biome.endFloor)}`
        : "";
      const perk = source.perkId ? lookups.perks[source.perkId] : undefined;
      const perkName = source.perkId ? (perk?.name ?? titleCase(source.perkId)) : undefined;
      const skillName = perk ? (lookups.skillNames[perk.skillId] ?? titleCase(perk.skillId)) : "";
      const tierStr = perk ? ` (${skillName} tier ${String(perk.tier)})` : "";
      const perkSuffix = perkName ? `, with the ${perkName} perk${tierStr}` : "";
      return `Find in a Treasure Chest in ${biomeName}${floorRange ? ` (${floorRange})` : ""}${perkSuffix}`;
    }
    case "mines_dig_site": {
      const biomeName = formatBiomeName(source.biomeId, lookups.biomes);
      const biome = lookups.biomes.find((b) => b.id === source.biomeId);
      const floorRange = biome
        ? `floors ${String(biome.startFloor)}–${String(biome.endFloor)}`
        : "";
      const perk = source.perkId ? lookups.perks[source.perkId] : undefined;
      const perkName = source.perkId ? (perk?.name ?? titleCase(source.perkId)) : undefined;
      const skillName = perk ? (lookups.skillNames[perk.skillId] ?? titleCase(perk.skillId)) : "";
      const tierStr = perk ? ` (${skillName} tier ${String(perk.tier)})` : "";
      const perkSuffix = perkName ? `, with the ${perkName} perk${tierStr}` : "";
      return `Dig up in ${biomeName}${floorRange ? ` (${floorRange})` : ""}${perkSuffix}`;
    }
    case "monster":
      return "Obtain as a monster drop";
    case "monster_feed":
      return "Receive from feeding a monster";
    case "museum_donation": {
      const wingName = titleCase(source.wingId);
      const setWord = source.setCount === 1 ? "set" : "sets";
      return `Complete ${String(source.setCount)} ${setWord} in the ${wingName} wing`;
    }
    case "perk":
    case "perk_drop":
    case "ritual_chamber": {
      const perk = lookups.perks[source.perkId];
      const perkName = perk?.name ?? titleCase(source.perkId);
      const skillName = perk ? (lookups.skillNames[perk.skillId] ?? titleCase(perk.skillId)) : "";
      const tierStr = perk ? ` (${skillName} tier ${String(perk.tier)})` : "";
      return `Unlock the ${perkName} perk${tierStr}`;
    }
    case "proposal":
      return "Receive after proposing to a dateable character";
    case "quest": {
      const name = lookups.questNames[source.questId] ?? titleCase(source.questId);
      return `Complete the ${name} quest`;
    }
    case "recipe":
      return "Obtained as a byproduct of crafting a recipe";
    case "renown":
      return `Get the town rank to level ${String(source.level)}`;
    case "scroll_bundle": {
      const storeName = resolveStoreName(source.storeId, lookups);
      return `Purchase the ${source.bundleName} from ${storeName}`;
    }
    case "station":
      return "Obtain from a crafting station";
    case "store": {
      const storeName = resolveStoreName(source.storeId, lookups);
      return `Purchase from ${storeName}`;
    }
    case "treasure_chest": {
      const tierData = lookups.treasureChestTiers[source.tier];
      const name = tierData?.name ?? `${titleCase(source.tier)} Treasure Box`;
      return `Fish up ${withIndefiniteArticle(name)}`;
    }
    case "tree":
      return "Grow on a tree";
    case "upgrade": {
      const storeName = resolveStoreName(source.storeId, lookups);
      return `Purchase ${source.upgradeName} from ${storeName}`;
    }
    case "wedding":
      return "Receive after getting married";
    case "wishing_well":
      return `Obtain from the Wishing Well (${String(source.cost.amount)}t)`;
  }
}

export function seasonLabel(season: Season): string {
  return SEASON_LABEL[season];
}

export function timeRangeLabel(hours: [number, number]): string {
  const fmt = (h: number) => {
    if (h === 0 || h === 24) return "12ᴀᴍ";
    if (h === 12) return "12ᴘᴍ";
    return h < 12 ? `${String(h)}ᴀᴍ` : `${String(h - 12)}ᴘᴍ`;
  };
  return `${fmt(hours[0])}–${fmt(hours[1])}`;
}

export function weatherLabel(weather: Weather, season?: Season): string {
  if (season) {
    return WEATHER_LABEL_BY_SEASON[season][weather] ?? WEATHER_LABEL[weather];
  }
  return WEATHER_LABEL[weather];
}

/** Weathers available for a given season (special only in spring/fall) */
export function weathersForSeason(season: Season): Weather[] {
  if (season === "summer" || season === "winter") {
    return ["calm", "inclement", "heavy_inclement"];
  }
  return ["calm", "inclement", "heavy_inclement", "special"];
}

export function withIndefiniteArticle(name: string): string {
  const firstChar = name.charAt(0).toLowerCase();
  const article = "aeiou".includes(firstChar) ? "an" : "a";
  return `${article} ${name}`;
}

function resolveStoreName(storeId: StoreId, lookups: RecipeSourceLookups): string {
  if (lookups.redactedStoreIds?.has(storeId)) return "???";
  return formatStoreName(storeId, lookups.stores);
}

function titleCase(s: string): string {
  return s
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
