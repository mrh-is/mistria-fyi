import localeManifest from "$lib/data/locales.json";
import { getName } from "$lib/data/names.js";
import * as m from "$lib/paraglide/messages.js";

import type { LocaleCode, LocaleManifest } from "$lib/types/locale.js";
import type {
  MinesBiome,
  MinesBiomeId,
  PerkId,
  QuestType,
  Season,
  SkillId,
  StoreId,
  TrackerData,
  TreasureChestTierId,
  Weather,
} from "$lib/types/tracker-data.js";

const SEASON_LABEL_ABBR: Record<Season, () => string> = {
  fall: m.season_fall_abbr,
  spring: m.season_spring_abbr,
  summer: m.season_summer_abbr,
  winter: m.season_winter_abbr,
};

/** Season-specific weather display names */
const WEATHER_LABEL_BY_SEASON: Record<Season, Partial<Record<Weather, () => string>>> = {
  fall: {},
  spring: {},
  summer: {},
  winter: {
    heavy_inclement: m.weather_winter_heavy_inclement,
    inclement: m.weather_winter_inclement,
  },
};

const WEATHER_LABEL: Record<Weather, () => string> = {
  calm: m.weather_calm,
  heavy_inclement: m.weather_heavy_inclement,
  inclement: m.weather_inclement,
  special: m.weather_special,
};

export type NameLookup<T> = Partial<Record<keyof T, string>>;

export type PartialPick<T, K extends keyof T> = {
  [P in K]: Partial<T[P]>;
};

export type RecipeSourceLookups = Pick<TrackerData, "perkTierLevels"> & {
  biomes: (MinesBiome & { name: string })[];
  festivals: Partial<Record<string, { date: { day: number; season: Season }; name: string }>>;
  itemNames: NameLookup<TrackerData["items"]>;
  perks: Partial<Record<PerkId, { name: string; skillId: SkillId; tier: number }>>;
  questNames: NameLookup<TrackerData["quests"][QuestType]>;
  recipeNames: NameLookup<TrackerData["recipes"]>;
  redactedStoreIds?: ReadonlySet<StoreId>;
  skillNames: NameLookup<TrackerData["skills"]>;
  stores: Partial<Record<StoreId, { article?: "the"; name: string; upgradeAction?: string }>>;
  treasureChestTiers: Partial<Record<TreasureChestTierId, { name: string }>>;
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
  biomes: RecipeSourceLookups["biomes"],
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

/** The game's own season name, from the `ui` chunk the root layout awaits. */
export function seasonLabel(season: Season, locale: LocaleCode): string {
  return getName("ui", season, locale);
}

const LOCALE_ENTRIES_BY_TAG = new Map(
  (localeManifest as LocaleManifest).map((entry) => [entry.tag, entry]),
);

/**
 * Composes a descriptor and a base name into one phrase using the active locale's word order and
 * spacing (e.g. an animal name + a cosmetic name: "Golden Retriever Crown" in English, where the
 * descriptor leads; some locales put it last instead).
 */
export function composeInfusion(descriptor: string, base: string, locale: LocaleCode): string {
  const entry = LOCALE_ENTRIES_BY_TAG.get(locale);
  if (!entry || entry.infusionOrder === "Adjective") {
    return `${descriptor}${entry?.infusionSpace ?? " "}${base}`;
  }
  return `${base}${entry.infusionSpace}${descriptor}`;
}

/** Formats a plain integer (e.g. a completion count) with the active locale's grouping. */
export function formatNumber(value: number, locale: LocaleCode): string {
  return new Intl.NumberFormat(locale).format(value);
}

/** Formats a 0–100 whole-number percentage with the active locale's symbol and spacing. */
export function formatPercent(value: number, locale: LocaleCode): string {
  return new Intl.NumberFormat(locale, { style: "percent" }).format(value / 100);
}

export function seasonLabelAbbr(season: Season): string {
  return SEASON_LABEL_ABBR[season]();
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
    return (WEATHER_LABEL_BY_SEASON[season][weather] ?? WEATHER_LABEL[weather])();
  }
  return WEATHER_LABEL[weather]();
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
