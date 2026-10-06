import localeManifest from "#lib/data/locales.json";
import { getName } from "#lib/data/names.js";
import * as m from "#lib/paraglide/messages.js";

import type { LocaleCode, LocaleManifest } from "#lib/types/locale.js";
import type {
  MinesBiome,
  MinesBiomeId,
  PerkId,
  QuestType,
  Season,
  SkillId,
  StoreId,
  StoreUpgradeAction,
  TrackerData,
  TreasureChestTierId,
  Weather,
} from "#lib/types/tracker-data.js";

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

export type BaseSegmentLookups = Pick<TrackerData, "perkTierLevels"> & {
  biomes: (MinesBiome & { name: string })[];
  festivals: Partial<Record<string, { date: { day: number; season: Season }; name: string }>>;
  itemNames: NameLookup<TrackerData["items"]>;
  perks: Partial<Record<PerkId, { name: string; skillId: SkillId; tier: number }>>;
  questNames: NameLookup<TrackerData["quests"][QuestType]>;
  recipeNames: NameLookup<TrackerData["recipes"]>;
  skillNames: NameLookup<TrackerData["skills"]>;
  spoileredStoreIds?: ReadonlySet<StoreId>;
  stores: Partial<
    Record<StoreId, { article?: "the"; name: string; upgradeAction?: StoreUpgradeAction }>
  >;
  treasureChestTiers: Partial<Record<TreasureChestTierId, { name: string }>>;
};

/** The named biome; like {@link requireEntry}, a missing biome is a data bug and throws. */
export function requireBiome<Biome extends { id: MinesBiomeId }>(
  biomeId: MinesBiomeId,
  biomes: readonly Biome[],
): Biome {
  const biome = biomes.find((b) => b.id === biomeId);
  if (!biome) throw new Error(`No biome for id "${biomeId}"`);
  return biome;
}

/**
 * An entry from a name lookup table. Every table is built from a key-complete name chunk or an
 * interim message table (see `getName`), so a missing entry is a data bug and throws rather than
 * rendering an untranslated ID.
 */
export function requireEntry<K extends string, T>(
  table: Partial<Record<K, T>>,
  id: K,
  tableName: string,
): T {
  const entry = table[id];
  if (entry === undefined) throw new Error(`No "${tableName}" entry for id "${id}"`);
  return entry;
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
export function composeDescriptorName(
  descriptor: string,
  base: string,
  locale: LocaleCode,
): string {
  const infusion = LOCALE_ENTRIES_BY_TAG.get(locale)?.infusion;
  if (!infusion || infusion.order === "Adjective") {
    return `${descriptor}${infusion?.space ?? " "}${base}`;
  }
  return `${base}${infusion.space}${descriptor}`;
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

/**
 * An hour range in the locale's own clock convention ("6:00 PM–2:00 AM", "18:00–2:00"). Game hours
 * run past midnight (26 is 2 AM the next day), so each end wraps onto a 24-hour clock. The ends are
 * formatted separately because `formatRange` rejects an end before its start on older engines.
 * Minutes stay in: several locales render a bare hour as a bare number.
 */
export function timeRangeLabel(hours: [number, number], locale: LocaleCode): string {
  const format = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
  const at = (hour: number) => format.format(Date.UTC(2000, 0, 1, hour % 24));
  return `${at(hours[0])}–${at(hours[1])}`;
}

export function weatherLabel(weather: Weather, season?: Season): string {
  if (season) {
    return (WEATHER_LABEL_BY_SEASON[season][weather] ?? WEATHER_LABEL[weather])();
  }
  return WEATHER_LABEL[weather]();
}
