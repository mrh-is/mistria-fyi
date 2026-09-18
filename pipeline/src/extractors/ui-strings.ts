import { LOCALE_CODES } from "$lib/types/locale.js";

import { localizeField } from "../localize.js";

import type { LocaleCode } from "$lib/types/locale.js";

import type { ParsedGameData } from "../parse-fiddle.js";

export interface UiStringExtraction {
  localeNames: Record<LocaleCode, Record<string, string>>;
}

/**
 * A `ui` chunk entry: a bare `misc_local` key, or an `id` whose label lives under a different
 * `misc_local` key (an almanac category's `local_key`).
 */
export type UiStringRequest = string | { id: string; miscLocalKey: string };

/**
 * Game UI vocabulary the app displays verbatim: almanac category labels, animal variant tier
 * labels, and any other label whose in-game text lives in `fiddle/misc_local.toml`. English is
 * the bare `misc_local` entry; every other locale is keyed `misc_local/<key>` in its translation
 * table. Only the requested keys are emitted, so the `ui` chunk stays small.
 */
export function extractUiStrings(
  fiddle: ParsedGameData,
  assetsDir: string,
  requests: readonly UiStringRequest[],
): UiStringExtraction {
  const localeNames = Object.fromEntries(LOCALE_CODES.map((locale) => [locale, {}])) as Record<
    LocaleCode,
    Record<string, string>
  >;
  const miscLocal = fiddle.misc_local as Record<string, unknown> | undefined;
  if (!miscLocal) throw new Error("fiddle/misc_local.toml is missing; UI strings need it");

  const byId = new Map<string, string>();
  for (const request of requests) {
    const { id, miscLocalKey } =
      typeof request === "string" ? { id: request, miscLocalKey: request } : request;
    const existing = byId.get(id);
    if (existing !== undefined && existing !== miscLocalKey) {
      throw new Error(
        `UI string "${id}" requested with conflicting misc_local keys "${existing}" and "${miscLocalKey}"`,
      );
    }
    byId.set(id, miscLocalKey);
  }

  for (const [id, key] of [...byId].sort(([a], [b]) => a.localeCompare(b))) {
    const english = miscLocal[key];
    if (typeof english !== "string" || english.length === 0) {
      throw new Error(`misc_local has no English string for UI key "${key}"`);
    }
    const { values } = localizeField(assetsDir, {
      category: "misc_local",
      classification: "localizable",
      englishValue: english,
      id: key,
    });
    for (const locale of LOCALE_CODES) localeNames[locale][id] = values[locale];
  }

  console.log(`  UI strings: ${byId.size.toString()} misc_local keys`);
  return { localeNames };
}

/** `tier_1` … `tier_<count>`, the game's labels for animal variant tiers. */
export function tierKeys(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `tier_${(index + 1).toString()}`);
}
