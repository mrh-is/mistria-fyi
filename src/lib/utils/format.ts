import type {
  MinesBiome,
  MinesBiomeId,
  Perk,
  PerkId,
  QuestType,
  Season,
  SkillId,
  StoreId,
  TrackerData,
  Weather,
} from "$lib/types/tracker-data.js";

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

export type NameLookup<T> = Partial<Record<keyof T, string>>;

export type PartialPick<T, K extends keyof T> = {
  [P in K]: Partial<T[P]>;
};

export type RecipeSourceLookups = PartialPick<
  TrackerData,
  "festivals" | "stores" | "treasureChestTiers"
> &
  Pick<TrackerData, "perkTierLevels"> & {
    biomes: MinesBiome[];
    itemNames: NameLookup<TrackerData["items"]>;
    perks: Partial<Record<PerkId, Perk & { skillId: SkillId; tier: number }>>;
    questNames: NameLookup<TrackerData["quests"][QuestType]>;
    recipeNames: NameLookup<TrackerData["recipes"]>;
    redactedStoreIds?: ReadonlySet<StoreId>;
    skillNames: NameLookup<TrackerData["skills"]>;
  };

/** Shorten repetitive quest name prefixes */
export function displayQuestName(name: string, questType: QuestType): string {
  if (questType === "fetch") {
    // "Request for a {item}" / "Request for {item}" → "{item}"
    // "Important Request for a Moon Fruit" → "Moon Fruit (Important)"
    if (name.startsWith("Important ")) {
      return `${name.replace(/^Important Request [Ff]or (an? )?/, "")} (Important)`;
    }
    return name.replace(/^Request [Ff]or (an? )?/, "");
  }
  if (questType === "crown") {
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
