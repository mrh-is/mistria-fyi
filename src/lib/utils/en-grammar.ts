/**
 * English-only grammar for names the game stores without articles or with long request prefixes.
 * Every helper takes the locale explicitly & returns its input unchanged for any other locale, so
 * call sites never need their own `locale === "en"` guard; other locales' messages carry their
 * own articles.
 */
import { requireBiome, requireEntry } from "#lib/utils/format.js";

import type { LocaleCode } from "#lib/types/locale.js";
import type { MinesBiomeId, QuestType, StoreId } from "#lib/types/tracker-data.js";
import type { BaseSegmentLookups } from "#lib/utils/format.js";

/** Shortens repetitive English quest name prefixes; other locales' names are shown as-is. */
export function displayQuestName(name: string, questType: QuestType, locale: LocaleCode): string {
  if (locale !== "en") return name;
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

/** The biome name with English's definite article ("the Tide Caverns"); other locales as-is. */
export function formatBiomeName(
  biomeId: MinesBiomeId,
  biomes: BaseSegmentLookups["biomes"],
  locale: LocaleCode,
): string {
  const biome = requireBiome(biomeId, biomes);
  if (locale !== "en") return biome.name;
  if (biome.name.startsWith("The ")) return `the ${biome.name.slice(4)}`;
  return `the ${biome.name}`;
}

/** The store name with English's definite article where the store takes one; others as-is. */
export function formatStoreName(
  storeId: StoreId,
  stores: Partial<Record<StoreId, { article?: "the"; name: string }>>,
  locale: LocaleCode,
): string {
  const store = requireEntry(stores, storeId, "stores");
  return locale === "en" && store.article ? `${store.article} ${store.name}` : store.name;
}

/** English prefixes "a"/"an"; other locales' messages handle articles themselves. */
export function withIndefiniteArticle(name: string, locale: LocaleCode): string {
  if (locale !== "en") return name;
  const firstChar = name.charAt(0).toLowerCase();
  const article = "aeiou".includes(firstChar) ? "an" : "a";
  return `${article} ${name}`;
}

/** Drops a leading "The " in English, where the message supplies the article ("the The"). */
export function withoutDefiniteArticle(name: string, locale: LocaleCode): string {
  return locale === "en" && name.startsWith("The ") ? name.slice(4) : name;
}
