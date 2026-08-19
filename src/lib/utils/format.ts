import type {
  MinesBiomeId,
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

export function formatBiomeName(
  biomeId: MinesBiomeId,
  biomes: TrackerData["mines"]["biomes"],
): string {
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

function titleCase(s: string): string {
  return s
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
