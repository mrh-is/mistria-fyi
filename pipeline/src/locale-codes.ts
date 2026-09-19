import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "smol-toml";

import { LOCALE_CODES } from "$lib/types/locale.js";

import type { InfusionFormat, LocaleCode } from "$lib/types/locale.js";

/**
 * The game's own internal language codes, as they appear in `l10n.meta.toml` and as the filename
 * stem of each `translations/<code>.meta.toml` file. Never imported by app code — the app only
 * ever sees the translated {@link LocaleCode} tags.
 */
export type GameLanguageCode =
  "eng" | "fra" | "jpn" | "kor" | "rus" | "spa" | "zh-Hans" | "zh-Hant";

/** The one place game language codes map to the BCP 47 tags the app uses. */
export const GAME_LANGUAGE_TO_LOCALE: Readonly<Record<GameLanguageCode, LocaleCode>> = {
  eng: "en",
  fra: "fr",
  jpn: "ja",
  kor: "ko",
  rus: "ru",
  spa: "es",
  "zh-Hans": "zh-Hans",
  "zh-Hant": "zh-Hant",
};

export interface GameLanguageMeta {
  displayName: string;
  infusion: InfusionFormat;
  ship: boolean;
}

/**
 * Throws if `l10n.meta.toml` lists a game language code {@link GAME_LANGUAGE_TO_LOCALE} doesn't
 * know how to map, or if the map has stale entries the game no longer ships — guards against the
 * game silently adding (or removing) a language this pipeline hasn't been updated for.
 */
export function assertGameLanguageMapExhaustive(assetsDir: string): void {
  const actual = new Set(Object.keys(readGameLanguages(assetsDir)));
  const known = new Set(Object.keys(GAME_LANGUAGE_TO_LOCALE));

  const unmapped = [...actual].filter((code) => !known.has(code));
  if (unmapped.length > 0) {
    throw new Error(
      `l10n.meta.toml lists game language(s) not in GAME_LANGUAGE_TO_LOCALE: ${unmapped.join(", ")}`,
    );
  }

  const stale = [...known].filter((code) => !actual.has(code));
  if (stale.length > 0) {
    throw new Error(
      `GAME_LANGUAGE_TO_LOCALE has stale entries no longer in l10n.meta.toml: ${stale.join(", ")}`,
    );
  }

  const mappedLocales = new Set(Object.values(GAME_LANGUAGE_TO_LOCALE));
  const missingLocales = LOCALE_CODES.filter((locale) => !mappedLocales.has(locale));
  if (missingLocales.length > 0) {
    throw new Error(
      `LOCALE_CODES has locale(s) no game language maps to: ${missingLocales.join(", ")}`,
    );
  }
}

/**
 * Reads `l10n.meta.toml`'s `display_name`, `ship`, `infusion_order`, and `infusion_space` fields,
 * keyed by game language code.
 */
export function readGameLanguages(assetsDir: string): Record<GameLanguageCode, GameLanguageMeta> {
  const path = join(assetsDir, "localization", "l10n.meta.toml");
  const toml = parse(readFileSync(path, "utf-8")) as {
    asset_properties: {
      languages: Record<
        string,
        {
          display_name: string;
          infusion_order: InfusionFormat["order"];
          infusion_space: string;
          ship: boolean;
        }
      >;
    };
  };

  const languages = toml.asset_properties.languages;
  const result = {} as Record<GameLanguageCode, GameLanguageMeta>;
  for (const [code, meta] of Object.entries(languages)) {
    result[code as GameLanguageCode] = {
      displayName: meta.display_name,
      infusion: { order: meta.infusion_order, space: meta.infusion_space },
      ship: meta.ship,
    };
  }
  return result;
}
