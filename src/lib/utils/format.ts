import type {
  BiomeId,
  RecipeId,
  RecipeSource,
  Season,
  SourceType,
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

const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  bug_catch: "Bug Catching",
  chest: "Chest",
  cook: "Cooking",
  craft: "Crafting",
  dig: "Digging",
  dive: "Diving",
  festival: "Festival",
  fish: "Fishing",
  forage: "Foraging",
  mine: "Mining",
  monster: "Monster Drop",
  quest: "Quest Reward",
  renown: "Renown Reward",
  sapling: "Sapling",
  seed: "Seed",
  store: "Store",
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

export function locationLabel(location: string): string {
  // Handles comma-separated locations like "narrows, eastern_road, town"
  return location
    .split(", ")
    .map((part) => titleCase(part))
    .join(", ");
}

export function recipeSourceLabel(source: RecipeSource, lookups: RecipeSourceLookups): string {
  switch (source.type) {
    case "beach_cave_chest":
      return "Find in the Gold Treasure Chest in the Beach Cave";
    case "chicken_statue":
      return `Obtain from the Chicken Statue (${String(source.cost)} beads)`;
    case "default":
      return "Available from the start";
    case "dragon_forge":
      return "Craft at the Dragon Forge (Mines level 90)";
    case "engagement":
      return "Receive from Elsie after getting to 10 hearts with a dateable character";
    case "festival": {
      const festivalName =
        lookups.festivals[source.festivalId]?.name ?? titleCase(source.festivalId);
      const storeName = resolveStoreName(source.storeId, lookups);
      return `Purchase from ${storeName} at the ${festivalName}`;
    }
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
    case "mines_chest": {
      const biomeName = formatBiomeName(source.biomeId, lookups.biomes);
      const biome = lookups.biomes.find((b) => b.id === source.biomeId);
      const floorRange = biome
        ? `floors ${String(biome.startFloor)}–${String(biome.endFloor)}`
        : "";
      const perk = lookups.perks[source.perkId];
      const perkName = perk?.name ?? titleCase(source.perkId);
      const skillName = perk ? (lookups.skillNames[perk.skillId] ?? titleCase(perk.skillId)) : "";
      const tierStr = perk ? ` (${skillName} tier ${String(perk.tier)})` : "";
      return `Find in a Treasure Chest in ${biomeName}${floorRange ? ` (${floorRange})` : ""}, with the ${perkName} perk${tierStr}`;
    }
    case "mines_dig_site": {
      const biomeName = formatBiomeName(source.biomeId, lookups.biomes);
      const biome = lookups.biomes.find((b) => b.id === source.biomeId);
      const floorRange = biome
        ? `floors ${String(biome.startFloor)}–${String(biome.endFloor)}`
        : "";
      const perk = lookups.perks[source.perkId];
      const perkName = perk?.name ?? titleCase(source.perkId);
      const skillName = perk ? (lookups.skillNames[perk.skillId] ?? titleCase(perk.skillId)) : "";
      const tierStr = perk ? ` (${skillName} tier ${String(perk.tier)})` : "";
      return `Dig up in ${biomeName}${floorRange ? ` (${floorRange})` : ""}, with the ${perkName} perk${tierStr}`;
    }
    case "museum_donation": {
      const wingName = titleCase(source.wingId);
      const setWord = source.setCount === 1 ? "set" : "sets";
      return `Complete ${String(source.setCount)} ${setWord} in the ${wingName} wing`;
    }
    case "perk": {
      const perk = lookups.perks[source.perkId];
      const perkName = perk?.name ?? titleCase(source.perkId);
      const skillName = perk ? (lookups.skillNames[perk.skillId] ?? titleCase(perk.skillId)) : "";
      const tierStr = perk ? ` (${skillName} tier ${String(perk.tier)})` : "";
      return `Unlock the ${perkName} perk${tierStr}`;
    }
    case "quest": {
      const name = lookups.questNames[source.questId] ?? titleCase(source.questId);
      return `Complete the ${name} quest`;
    }
    case "renown":
      return `Get the town rank to level ${String(source.level)}`;
    case "scroll_bundle": {
      const storeName = resolveStoreName(source.storeId, lookups);
      return `Purchase the ${source.bundleName} from ${storeName}`;
    }
    case "store": {
      const storeName = resolveStoreName(source.storeId, lookups);
      const suffix = source.upgraded ? " (after upgrade)" : "";
      return `Purchase from ${storeName}${suffix}`;
    }
    case "store_with_perk": {
      const storeName = resolveStoreName(source.storeId, lookups);
      const perk = lookups.perks[source.perkId];
      const perkName = perk?.name ?? titleCase(source.perkId);
      return `Purchase from ${storeName} (requires ${perkName} perk)`;
    }
    case "treasure_chest": {
      const tierData = lookups.treasureChestTiers[source.tier];
      const name = tierData?.name ?? `${titleCase(source.tier)} Treasure Box`;
      return `Fish up ${withIndefiniteArticle(name)}`;
    }
    case "upgrade": {
      const storeName = resolveStoreName(source.storeId, lookups);
      return `Purchase ${source.upgradeName} from ${storeName}`;
    }
    case "wishing_well":
      return `Obtain from the Wishing Well (${String(source.cost)}t)`;
  }
}

export function seasonLabel(season: Season): string {
  return SEASON_LABEL[season];
}

export function sourceTypeLabel(type: SourceType): string {
  return SOURCE_TYPE_LABEL[type];
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
