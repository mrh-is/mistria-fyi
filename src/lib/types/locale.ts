/**
 * The 8 BCP 47 locale tags the game ships translations for. `en` is the only "stable" locale;
 * the other 7 are machine/community translations the game itself ships as "beta".
 */
export const LOCALE_CODES = ["en", "ja", "zh-Hans", "zh-Hant", "es", "fr", "ko", "ru"] as const;

/**
 * Word order and spacing for composed phrases like an animal name + cosmetic name: `order:
 * "Adjective"` puts the descriptor first (e.g. "Golden Retriever Crown"), `"Noun"` puts it last
 * (e.g. "Crown Golden Retriever"). `space` is the separator between the two parts; some locales
 * use no space at all.
 */
export interface InfusionFormat {
  order: "Adjective" | "Noun";
  space: string;
}

export type LocaleCode = (typeof LOCALE_CODES)[number];

export type LocaleManifest = LocaleManifestEntry[];

export interface LocaleManifestEntry {
  displayName: string;
  infusion: InfusionFormat;
  status: LocaleStatus;
  tag: LocaleCode;
}

export type LocaleStatus = "beta" | "stable";
