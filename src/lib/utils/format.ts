import type { RecipeSource, Season, SourceType, Weather } from "$lib/types/tracker-data.js";

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

export function locationLabel(location: string): string {
  // Handles comma-separated locations like "narrows, eastern_road, town"
  return location
    .split(", ")
    .map((part) => titleCase(part))
    .join(", ");
}

export function recipeSourceLabel(
  source: RecipeSource,
  lookups: {
    biomeNames?: Record<string, string>;
    itemNames?: Record<string, string>;
    questNames?: Record<string, string>;
  },
): string {
  switch (source.type) {
    case "beach_cave_chest":
      return "Treasure chest in the Beach Cave";
    case "chicken_statue": {
      const beadLabel: Record<string, string> = { large: "100", small: "10" };
      return `Chicken Statue (${beadLabel[source.tier]} beads)`;
    }
    case "default":
      return "Default recipe";
    case "dragon_forge":
      return "Dragon forge";
    case "dungeon_chest": {
      const biomeName = lookups.biomeNames?.[source.biomeId] ?? titleCase(source.biomeId);
      const perkName = titleCase(source.perk);
      return `Treasure chest in ${biomeName} with ${perkName} perk`;
    }
    case "festival":
      return `${titleCase(source.festivalId)} festival — ${titleCase(source.storeId)}`;
    case "letter":
      if (source.trigger === "shipped_item") {
        const name = lookups.itemNames?.[source.triggerItemId] ?? titleCase(source.triggerItemId);
        return `Ship ${name}`;
      }
      if (source.trigger === "donated_item") {
        const name = lookups.itemNames?.[source.triggerItemId] ?? titleCase(source.triggerItemId);
        return `Donate ${name}`;
      }
      return "Letter";
    case "museum_donation": {
      const wingName = titleCase(source.wingId);
      return `Complete ${String(source.setCount)} sets in the ${wingName} wing`;
    }
    case "perk":
      return `${titleCase(source.perk)} perk`;
    case "quest": {
      const name = lookups.questNames?.[source.questId] ?? titleCase(source.questId);
      return `Quest — ${name}`;
    }
    case "relationship":
      return "Get to 10 hearts with a dateable character";
    case "renown":
      return `Town rank level ${String(source.level)}`;
    case "scroll_bundle":
      return `Purchase ${source.bundleName} from ${titleCase(source.storeId)}`;
    case "store":
      return `Purchase from ${titleCase(source.storeId)}`;
    case "treasure_chest":
      return `Fish up a ${titleCase(source.chestTier)} Treasure Box`;
    case "upgrade":
      return `Purchase ${source.upgradeName} from the carpenter`;
    case "wishing_well": {
      const ticketLabel: Record<string, string> = { large: "500", small: "100" };
      return `Wishing Well (${ticketLabel[source.tier]}t)`;
    }
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

function titleCase(s: string): string {
  return s
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
