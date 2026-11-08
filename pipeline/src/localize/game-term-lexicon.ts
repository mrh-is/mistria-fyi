import { resolve } from "node:path";

import { LOCALE_CODES } from "#lib/types/locale.js";

import { readAlmanacCategories } from "../extract/almanac.js";
import { readLocationNames } from "../extract/locations.js";
import { readSkillEntries, skillNameInput } from "../extract/skills.js";
import { compareStrings } from "../ordering.js";
import { deriveKey } from "./localize.js";

import type { LocaleCode } from "#lib/types/locale.js";

import type { StagedFile } from "../emit/publish.js";
import type { ParsedGameData } from "../parse/parse-fiddle.js";
import type { LocalizeFieldInput, Localizer } from "./localize.js";

function compareEntryIds([a]: [string, unknown], [b]: [string, unknown]): number {
  return compareStrings(a, b);
}

export function stageGameTermLexicon(
  pipelineRoot: string,
  version: string,
  fiddle: ParsedGameData,
  localizer: Localizer,
): StagedFile {
  const locales = extractGameTermLexicon(fiddle, localizer);
  return {
    content: `${JSON.stringify({ locales, version }, null, 2)}\n`,
    path: resolve(pipelineRoot, "output", "game-term-lexicon.json"),
  };
}

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
  const seals = readLocationNames(fiddle).filter(([id]) => id.endsWith("_seal"));
  const miscLocal = fiddle.misc_local as Record<string, unknown> | undefined;
  const skills = readSkillEntries(fiddle);
  if (almanacCategories.length === 0) throw new Error("Missing Almanac categories for game terms");
  if (skills.length === 0) throw new Error("Missing skill names for game terms");
  if (seals.length === 0) throw new Error("Missing mine seal locations for game terms");

  for (const [id, name] of seals.toSorted(compareEntryIds)) {
    addTerm(namedTerm("locations", id, name, "name"));
  }
  addTerm(namedTerm("misc_local", "the_almanac", miscLocal?.the_almanac));
  for (const { key, localKey } of almanacCategories.toSorted((a, b) =>
    compareStrings(a.localKey, b.localKey),
  )) {
    addTerm(namedTerm("misc_local", localKey, miscLocal?.[localKey]), key === "song_crystal");
  }
  for (const [id, skill] of skills.toSorted(compareEntryIds)) {
    addTerm(skillNameInput(fiddle, id, skill));
  }
  return lexicon;

  function addTerm(input: LocalizeFieldInput, allowMissingJapanese = false): void {
    const key = deriveKey(input.category, input.id, input.field);
    if (input.englishValue.trim().length === 0) {
      throw new Error(`Missing game term "${key}" for locale "en"`);
    }
    const { fallbackLocales, values } = localizer.localizeField({
      ...input,
      logMissing: false,
    });
    // Song crystals are omitted only while the native Japanese translation is absent.
    const omitTerm = allowMissingJapanese && fallbackLocales.includes("ja");
    for (const locale of LOCALE_CODES) {
      if (omitTerm && locale === "ja") continue;
      if (fallbackLocales.includes(locale) || values[locale].trim().length === 0) {
        throw new Error(`Missing game term "${key}" for locale "${locale}"`);
      }
      if (!omitTerm) lexicon[locale][key] = values[locale];
    }
  }
}

function namedTerm(
  category: string,
  id: string,
  name: unknown,
  field?: string,
): LocalizeFieldInput {
  const englishValue = typeof name === "string" ? name : "";
  return {
    category,
    classification: "localizable",
    englishValue,
    expectedEnglishValue: englishValue,
    field,
    id,
  };
}
