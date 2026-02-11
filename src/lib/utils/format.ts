import type { Season, SourceType, Weather } from "$lib/types/tracker-data.js";

const SEASON_LABEL: Record<Season, string> = {
  fall: "Fall",
  spring: "Spring",
  summer: "Summer",
  winter: "Winter",
};

/** Season-specific weather display names from the wiki */
const WEATHER_LABEL_BY_SEASON: Record<Season, Partial<Record<Weather, string>>> = {
  fall: {
    calm: "Sunny",
    heavy_inclement: "Thunderstorm",
    inclement: "Rain",
    special: "Breezy",
  },
  spring: {
    calm: "Sunny",
    heavy_inclement: "Thunderstorm",
    inclement: "Rain",
    special: "Breezy",
  },
  summer: {
    calm: "Sunny",
    heavy_inclement: "Thunderstorm",
    inclement: "Rain",
  },
  winter: {
    calm: "Sunny",
    heavy_inclement: "Blizzard",
    inclement: "Snow",
  },
};

const WEATHER_LABEL: Record<Weather, string> = {
  calm: "Sunny",
  heavy_inclement: "Storm",
  inclement: "Rain",
  special: "Special",
};

const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  bug_catch: "Bug Catching",
  chest: "Chest",
  cook: "Cooking",
  craft: "Crafting",
  dig: "Digging",
  dive: "Diving",
  fish: "Fishing",
  forage: "Foraging",
  mine: "Mining",
  monster: "Monster Drop",
  quest: "Quest Reward",
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

/** Parse almanac category key like "furniture/tide_set" → { group: "Furniture", name: "Tide Set" } */
export function parseAlmanacCategory(key: string): { group: string; name: string } {
  const slashIdx = key.indexOf("/");
  if (slashIdx === -1) {
    return { group: "Other", name: titleCase(key) };
  }
  return {
    group: titleCase(key.slice(0, slashIdx)),
    name: titleCase(key.slice(slashIdx + 1)),
  };
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
