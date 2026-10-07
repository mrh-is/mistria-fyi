import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "smol-toml";

import { LOCALE_CODES } from "#lib/types/locale.js";

import { GAME_LANGUAGE_TO_LOCALE, readGameLanguages } from "./locale-codes.js";

import type { LocaleCode, LocaleManifest, LocaleStatus } from "#lib/types/locale.js";

import type { GameLanguageCode } from "./locale-codes.js";

/**
 * How a text field is treated for localization purposes:
 * - `localizable`: has (or derives) an l10n key and should be translated per locale.
 * - `structural`: not player-facing prose (an enum tag, an internal ID) and never translated —
 *   the English value is used for every locale.
 */
export type FieldClassification = "localizable" | "structural";

export interface LocalizeFieldInput {
  /** Category path, e.g. `"npcs"` or `"items/fish/bait_fish"`. */
  category: string;
  classification: FieldClassification;
  /** The value already present in the (English) source fiddle data. */
  englishValue: string;
  /** Expected source name for ordinal paths; also checked against each locale’s English source cache. */
  expectedEnglishValue?: string;
  /** Field name, e.g. `"name"`. Omit for keys with no field segment, such as `misc_local/<id>`. */
  field?: string;
  id: string;
  /** Set false when a bulk extractor emits its own deterministic aggregate fallback report. */
  logMissing?: boolean;
  /** Require at least one game source cache to contain the expected English value. */
  requireEnglishSource?: boolean;
}

export interface LocalizeFieldResult {
  /** Locales where the derived/overridden key had no entry and fell back to English. */
  fallbackLocales: LocaleCode[];
  /** The localized string for every {@link LocaleCode}, always including `"en"`. */
  values: Record<LocaleCode, string>;
}

/** Which `localization/` directory a translation table comes from. */
export type TranslationDirectory = "source_caches" | "translations";

/**
 * Supplies one game language's key-to-string table. {@link createLocalizer} memoizes each table, so
 * a source may read from disk on every call.
 */
export type TranslationTableSource = (
  gameLanguage: GameLanguageCode,
  directory: TranslationDirectory,
) => ReadonlyMap<string, string>;

/**
 * Resolves text fields to every {@link LocaleCode}. Extractors receive one instead of an assets
 * path, so tests inject in-memory tables rather than mocking this module.
 */
export interface Localizer {
  localizeField: (input: LocalizeFieldInput) => LocalizeFieldResult;
}

type TableLoader = (
  gameLanguage: GameLanguageCode,
  directory?: TranslationDirectory,
) => ReadonlyMap<string, string>;

/** A {@link Localizer} reading `<assetsDir>/localization/<directory>/<language>.meta.toml`. */
export function createAssetsLocalizer(assetsDir: string): Localizer {
  return createLocalizer((gameLanguage, directory) =>
    readTranslationTable(assetsDir, gameLanguage, directory),
  );
}

/** A {@link Localizer} over any table source, memoizing each table it loads. */
export function createLocalizer(source: TranslationTableSource): Localizer {
  const cache = new Map<string, ReadonlyMap<string, string>>();
  const loadTable: TableLoader = (gameLanguage, directory = "translations") => {
    const cacheKey = `${directory} ${gameLanguage}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;
    const table = source(gameLanguage, directory);
    cache.set(cacheKey, table);
    return table;
  };
  return { localizeField: (input) => localizeField(loadTable, input) };
}

/** Generates the `locales.json` manifest from `l10n.meta.toml`'s per-language fields. */
export function generateLocaleManifest(assetsDir: string): LocaleManifest {
  const languages = readGameLanguages(assetsDir);

  return Object.entries(languages).map(([gameLanguage, meta]) => {
    const tag = GAME_LANGUAGE_TO_LOCALE[gameLanguage as GameLanguageCode];
    const status: LocaleStatus = meta.ship ? "stable" : "beta";
    return {
      displayName: meta.displayName,
      infusion: meta.infusion,
      status,
      tag,
    };
  });
}

/**
 * Resolves a single text field to its localized value in every {@link LocaleCode}, deriving the
 * l10n key and translating game language codes to BCP 47 tags along the way.
 *
 * Throws for ordinal English baselines that differ from the source cache.
 * A classified field whose key is simply absent from a beta locale’s
 * translation table is the normal, expected case — this logs and falls back to English rather
 * than throwing.
 */
function localizeField(loadTable: TableLoader, input: LocalizeFieldInput): LocalizeFieldResult {
  const values = { en: input.englishValue } as Record<LocaleCode, string>;
  const fallbackLocales: LocaleCode[] = [];

  if (input.classification === "structural") {
    for (const locale of LOCALE_CODES) values[locale] = input.englishValue;
    return { fallbackLocales, values };
  }

  const key = deriveKey(input.category, input.id, input.field);

  if (
    input.expectedEnglishValue !== undefined &&
    input.englishValue !== input.expectedEnglishValue
  ) {
    throw new Error(
      `English localization mismatch for ordinal key "${key}": expected "${input.expectedEnglishValue}", got "${input.englishValue}"`,
    );
  }

  if (input.requireEnglishSource && input.expectedEnglishValue === undefined) {
    throw new Error(`Missing expected English value for source-backed key "${key}"`);
  }

  let hasEnglishSource = false;
  for (const [gameLanguage, locale] of Object.entries(GAME_LANGUAGE_TO_LOCALE)) {
    if (locale === "en") continue;

    const table = loadTable(gameLanguage as GameLanguageCode);
    if (input.expectedEnglishValue !== undefined) {
      const sourceEnglish = loadTable(gameLanguage as GameLanguageCode, "source_caches").get(key);
      if (sourceEnglish !== undefined) hasEnglishSource = true;
      // A wholly absent beta entry can still fall back to English. A translation requires its
      // matching English baseline, and an existing baseline must never describe another ordinal.
      if (
        (sourceEnglish !== undefined || table.has(key)) &&
        sourceEnglish !== input.expectedEnglishValue
      ) {
        throw new Error(
          `English localization mismatch for ordinal key "${key}" in ${gameLanguage}: expected "${input.expectedEnglishValue}", got ${JSON.stringify(sourceEnglish)}`,
        );
      }
    }

    const translated = table.get(key);

    if (translated === undefined) {
      if (input.logMissing !== false) {
        console.log(
          `  Localization: missing "${key}" for locale "${locale}", falling back to English`,
        );
      }
      values[locale] = input.englishValue;
      fallbackLocales.push(locale);
    } else {
      values[locale] = translated;
    }
  }

  if (input.requireEnglishSource && !hasEnglishSource) {
    throw new Error(`Missing English source cache for "${key}"`);
  }

  return { fallbackLocales, values };
}

function deriveKey(category: string, id: string, field: string | undefined): string {
  return field === undefined ? `${category}/${id}` : `${category}/${id}/${field}`;
}

function readTranslationTable(
  assetsDir: string,
  gameLanguage: GameLanguageCode,
  directory: TranslationDirectory,
): ReadonlyMap<string, string> {
  const path = join(assetsDir, "localization", directory, `${gameLanguage}.meta.toml`);
  const toml = parse(readFileSync(path, "utf8")) as {
    asset_properties: Record<string, unknown>;
  };

  const table = new Map<string, string>();
  for (const [key, value] of Object.entries(toml.asset_properties)) {
    if (typeof value === "string") table.set(key, value);
  }
  return table;
}
