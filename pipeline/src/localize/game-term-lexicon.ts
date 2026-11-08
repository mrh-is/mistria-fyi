import { LOCALE_CODES } from "#lib/types/locale.js";

import { readAlmanacCategories } from "../extract/almanac.js";
import { compareStrings } from "../ordering.js";
import { SKILL_ENGLISH_NAMES } from "../overrides/ordinal-names.js";

import type { LocaleCode } from "#lib/types/locale.js";

import type { ParsedGameData } from "../parse/parse-fiddle.js";
import type { Localizer } from "./localize.js";

const SEAL_LOCATIONS = ["earth_seal", "fire_seal", "ruins_seal", "void_seal", "water_seal"];

/** Translator reference keyed by native localization path, with no English fallbacks. */
export function extractGameTermLexicon(
  fiddle: ParsedGameData,
  localizer: Localizer,
): Record<LocaleCode, Record<string, string>> {
  const lexicon = Object.fromEntries(LOCALE_CODES.map((locale) => [locale, {}])) as Record<
    LocaleCode,
    Record<string, string>
  >;
  const almanacCategories = readAlmanacCategories(fiddle);
  const locations = fiddle.locations as Record<string, { name?: unknown }> | undefined;
  const miscLocal = fiddle.misc_local as Record<string, unknown> | undefined;
  const skills = fiddle.skills as Record<string, { name?: unknown }> | undefined;
  if (almanacCategories.length === 0) throw new Error("Missing Almanac categories for game terms");
  if (!skills || Object.keys(skills).every((id) => id === "default")) {
    throw new Error("Missing skill names for game terms");
  }

  for (const id of SEAL_LOCATIONS) addTerm("locations", id, locations?.[id]?.name, "name");
  // The game has no Japanese song crystal label.
  const almanacKeys = new Set([
    "the_almanac",
    ...almanacCategories.map(({ localKey }) => localKey).filter((key) => key !== "song_crystal"),
  ]);
  for (const id of [...almanacKeys].toSorted(compareStrings)) {
    addTerm("misc_local", id, miscLocal?.[id]);
  }
  for (const id of Object.keys(skills).toSorted(compareStrings)) {
    if (id === "default") continue;
    addTerm("ui/skill_menu", id, skills[id].name ?? SKILL_ENGLISH_NAMES[id], "name");
  }
  return lexicon;

  function addTerm(category: string, id: string, english: unknown, field?: string): void {
    const key = field === undefined ? `${category}/${id}` : `${category}/${id}/${field}`;
    if (typeof english !== "string" || english.trim().length === 0) {
      throw new Error(`Missing game term "${key}" for locale "en"`);
    }
    const { fallbackLocales, values } = localizer.localizeField({
      category,
      classification: "localizable",
      englishValue: english,
      expectedEnglishValue: english,
      field,
      id,
      logMissing: false,
    });
    for (const locale of LOCALE_CODES) {
      if (fallbackLocales.includes(locale) || values[locale].trim().length === 0) {
        throw new Error(`Missing game term "${key}" for locale "${locale}"`);
      }
      lexicon[locale][key] = values[locale];
    }
  }
}
