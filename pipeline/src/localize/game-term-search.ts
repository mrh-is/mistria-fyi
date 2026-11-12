import { GAME_LANGUAGE_TO_LOCALE } from "./locale-codes.js";

import type { LocaleCode } from "#lib/types/locale.js";

import type { GameLanguageCode } from "./locale-codes.js";
import type { TranslationTableSource } from "./localize.js";

interface GameTermMatch {
  key: string;
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
  for (const language of TARGET_LANGUAGES) {
    for (const [key, english] of loadTable(language, "source_caches")) {
      if (!englishByKey.has(key) && english.toLowerCase().includes(needle)) {
        englishByKey.set(key, english);
      }
    }
  }
  if (englishByKey.size === 0) return [];

  const tables = TARGET_LANGUAGES.map(
    (language) => [GAME_LANGUAGE_TO_LOCALE[language], loadTable(language, "translations")] as const,
  );
  return [...englishByKey]
    .toSorted(([a], [b]) => (a < b ? -1 : Number(a > b)))
    .map(([key, english]) => {
      const text = { en: english } as Record<LocaleCode, null | string>;
      for (const [locale, table] of tables) {
        const value = table.get(key);
        text[locale] = value?.trim() ? value : null;
      }
      return { key, text };
    });
}
