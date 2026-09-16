/**
 * The 8 BCP 47 locale tags the game ships translations for. `en` is the only "stable" locale;
 * the other 7 are machine/community translations the game itself ships as "beta".
 */
export const LOCALE_CODES = ["en", "ja", "zh-Hans", "zh-Hant", "es", "fr", "ko", "ru"] as const;

export type LocaleCode = (typeof LOCALE_CODES)[number];

export type LocaleManifest = LocaleManifestEntry[];

export interface LocaleManifestEntry {
  displayName: string;
  status: LocaleStatus;
  tag: LocaleCode;
}

export type LocaleStatus = "beta" | "stable";
