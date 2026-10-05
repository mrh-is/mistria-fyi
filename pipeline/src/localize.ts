import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "smol-toml";

import { LOCALE_CODES } from "#lib/types/locale.js";

import { GAME_LANGUAGE_TO_LOCALE, readGameLanguages } from "./locale-codes.js";
import overrides from "./localize-overrides.json" with { type: "json" };

import type { LocaleCode, LocaleManifest, LocaleStatus } from "#lib/types/locale.js";

import type { GameLanguageCode } from "./locale-codes.js";

/**
 * How a text field is treated for localization purposes:
 * - `localizable`: has (or derives) an l10n key and should be translated per locale.
 * - `structural`: not player-facing prose (an enum tag, an internal ID) and never translated —
 *   the English value is used for every locale.
 * - `override`: the field's l10n key can't be derived from category + ID; it's looked up in
 *   {@link localize-overrides.json} instead.
 */
export type FieldClassification = "localizable" | "override" | "structural";

export interface LocalizeFieldInput {
  /** Category path, e.g. `"npcs"` or `"items/fish/bait_fish"`. */
  category: string;
  classification: FieldClassification;
  /** The value already present in the (English) source fiddle data. */
  englishValue: string;
  /** Expected source name for ordinal paths, guarding against upstream reordering. */
  expectedEnglishValue?: string;
  /** Field name, e.g. `"name"`. Omit for keys with no field segment, such as `misc_local/<id>`. */
  field?: string;
  id: string;
  /** Set false when a bulk extractor emits its own deterministic aggregate fallback report. */
  logMissing?: boolean;
}

export interface LocalizeFieldResult {
  /** Locales where the derived/overridden key had no entry and fell back to English. */
  fallbackLocales: LocaleCode[];
  /** The localized string for every {@link LocaleCode}, always including `"en"`. */
  values: Record<LocaleCode, string>;
}

const translationTableCache = new Map<string, ReadonlyMap<string, string>>();

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
 * Resolves a single text field to its localized value in every {@link LocaleCode}, deriving (or
 * looking up an override for) the l10n key, translating game language codes to BCP 47 tags along
 * the way.
 *
 * Throws only when the field's {@link FieldClassification} is unusable (an `override` field with
 * no override entry). A classified field whose key is simply absent from a beta locale's
 * translation table is the normal, expected case — this logs and falls back to English rather
 * than throwing.
 */
export function localizeField(assetsDir: string, input: LocalizeFieldInput): LocalizeFieldResult {
  const values = { en: input.englishValue } as Record<LocaleCode, string>;
  const fallbackLocales: LocaleCode[] = [];

  if (input.classification === "structural") {
    for (const locale of LOCALE_CODES) values[locale] = input.englishValue;
    return { fallbackLocales, values };
  }

  const key = resolveKey(input);

  if (input.expectedEnglishValue !== undefined) {
    if (input.englishValue !== input.expectedEnglishValue) {
      throw new Error(
        `English localization mismatch for ordinal key "${key}": expected "${input.expectedEnglishValue}", got "${input.englishValue}"`,
      );
    }
  }

  for (const [gameLanguage, locale] of Object.entries(GAME_LANGUAGE_TO_LOCALE)) {
    if (locale === "en") continue;

    const table = loadTranslationTable(assetsDir, gameLanguage as GameLanguageCode);
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

  return { fallbackLocales, values };
}

function deriveKey(category: string, id: string, field: string | undefined): string {
  return field === undefined ? `${category}/${id}` : `${category}/${id}/${field}`;
}

function loadTranslationTable(
  assetsDir: string,
  gameLanguage: GameLanguageCode,
): ReadonlyMap<string, string> {
  const cacheKey = `${assetsDir} ${gameLanguage}`;
  const cached = translationTableCache.get(cacheKey);
  if (cached) return cached;

  const path = join(assetsDir, "localization", "translations", `${gameLanguage}.meta.toml`);
  const toml = parse(readFileSync(path, "utf-8")) as {
    asset_properties: Record<string, unknown>;
  };

  const table = new Map<string, string>();
  for (const [key, value] of Object.entries(toml.asset_properties)) {
    if (typeof value === "string") table.set(key, value);
  }

  translationTableCache.set(cacheKey, table);
  return table;
}

function resolveKey(input: LocalizeFieldInput): string {
  const derived = deriveKey(input.category, input.id, input.field);
  const override = (overrides as Record<string, string>)[derived];

  if (input.classification === "override") {
    if (!override) {
      throw new Error(
        `Field classified "override" has no entry in localize-overrides.json for derived key "${derived}"`,
      );
    }
    return override;
  }

  return override ?? derived;
}
