import { GAME_LANGUAGE_TO_LOCALE } from "./locale-codes.js";

import type { LocaleCode } from "#lib/types/locale.js";

import type { GameLanguageCode } from "./locale-codes.js";
import type { TranslationTableSource } from "./localize.js";

interface GameTermMatch {
  key: string;
  sourceDifferences: Partial<Record<LocaleCode, string>>;
  text: Record<LocaleCode, null | string>;
}

const TARGET_LANGUAGES = (Object.keys(GAME_LANGUAGE_TO_LOCALE) as GameLanguageCode[]).filter(
  (language) => language !== "eng",
);

/** Searches the union of English source caches, then joins raw target strings by native key. */
export function searchGameTerms(query: string, loadTable: TranslationTableSource): GameTermMatch[] {
  const needle = query.trim().toLowerCase();
  if (!needle) throw new Error("Pass an English word or phrase: pnpm run game-term -- cosmetic");

  const englishByKey = new Map<string, string>();
  const sources = TARGET_LANGUAGES.map(
    (language) => [language, loadTable(language, "source_caches")] as const,
  );
  for (const [, source] of sources) {
    for (const [key, english] of source) {
      if (!englishByKey.has(key) && english.toLowerCase().includes(needle)) {
        englishByKey.set(key, english);
      }
    }
  }
  if (englishByKey.size === 0) return [];

  const tables = sources.map(([language, source]) => ({
    locale: GAME_LANGUAGE_TO_LOCALE[language],
    source,
    target: loadTable(language, "translations"),
  }));
  return [...englishByKey]
    .toSorted(([a], [b]) => (a < b ? -1 : Number(a > b)))
    .map(([key, english]) => {
      const text = { en: english } as Record<LocaleCode, null | string>;
      const sourceDifferences: GameTermMatch["sourceDifferences"] = {};
      for (const { locale, source, target } of tables) {
        const value = target.get(key);
        const cachedEnglish = source.get(key);
        text[locale] = value?.trim() ? value : null;
        if (text[locale] !== null && cachedEnglish !== undefined && cachedEnglish !== english) {
          sourceDifferences[locale] = cachedEnglish;
        }
      }
      return { key, sourceDifferences, text };
    });
}
