import type { Season, SourceType, Weather } from "$lib/types/tracker-data.js";

const SEASON_EMOJI: Record<Season, string> = {
  fall: "🍂",
  spring: "🌸",
  summer: "☀️",
  winter: "❄️",
};

const SEASON_LABEL: Record<Season, string> = {
  fall: "Fall",
  spring: "Spring",
  summer: "Summer",
  winter: "Winter",
};

const WEATHER_EMOJI: Record<Weather, string> = {
  calm: "☀️",
  heavy_inclement: "⛈️",
  inclement: "🌧️",
  special: "✨",
};

const WEATHER_LABEL: Record<Weather, string> = {
  calm: "Calm",
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

export function seasonEmoji(season: Season): string {
  return SEASON_EMOJI[season];
}

export function seasonLabel(season: Season): string {
  return SEASON_LABEL[season];
}

export function sourceTypeLabel(type: SourceType): string {
  return SOURCE_TYPE_LABEL[type];
}

export function timeRangeLabel(hours: [number, number]): string {
  const fmt = (h: number) => {
    if (h === 0 || h === 24) return "12AM";
    if (h === 12) return "12PM";
    return h < 12 ? `${String(h)}AM` : `${String(h - 12)}PM`;
  };
  return `${fmt(hours[0])}–${fmt(hours[1])}`;
}

export function weatherEmoji(weather: Weather): string {
  return WEATHER_EMOJI[weather];
}

export function weatherLabel(weather: Weather): string {
  return WEATHER_LABEL[weather];
}

function titleCase(s: string): string {
  return s
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
