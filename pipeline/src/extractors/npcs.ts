import { LOCALE_CODES } from "$lib/types/locale.js";

import { localizeField } from "../localize.js";

import type { LocaleCode } from "$lib/types/locale.js";
import type { NpcId, Season, TrackerData } from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle.js";

export interface NpcExtraction {
  /** Per-locale `npcs` name chunks, written to `src/lib/data/locales/<tag>/npcs.json`. */
  localeNames: Record<LocaleCode, Record<NpcId, string>>;
  /** The structural NPC records. Player-facing names live in {@link localeNames}, not here. */
  npcs: TrackerData["npcs"];
}

/**
 * Extracts NPC records plus their per-locale display names.
 *
 * `name` is deliberately absent from the emitted {@link TrackerData} records: a field that doesn't
 * exist on the type is the guardrail against rendering untranslated data. Callers resolve names
 * through `getName("npcs", id, locale)` instead.
 */
export function extractNpcs(fiddle: ParsedGameData, assetsDir: string): NpcExtraction {
  const localeNames = Object.fromEntries(LOCALE_CODES.map((locale) => [locale, {}])) as Record<
    LocaleCode,
    Record<NpcId, string>
  >;

  const npcs = fiddle.npcs as Record<string, Record<string, unknown>> | undefined;
  if (!npcs) return { localeNames, npcs: {} };

  const result = {} as Record<NpcId, TrackerData["npcs"][NpcId]>;
  for (const [id, npc] of Object.entries(npcs)) {
    if (id === "default") continue;

    const name = npc.name as string | undefined;
    if (!name) continue;

    const birthday = npc.birthday as undefined | { day?: number; season?: string };
    if (!birthday?.season || typeof birthday.day !== "number") continue;

    const dateable = npc.dateable === true;

    result[id as NpcId] = {
      birthday: {
        day: birthday.day,
        season: birthday.season as Season,
      },
      ...(dateable ? { dateable } : {}),
    };

    const { values } = localizeField(assetsDir, {
      category: "npcs",
      classification: "localizable",
      englishValue: name,
      field: "name",
      id,
    });

    for (const locale of LOCALE_CODES) localeNames[locale][id as NpcId] = values[locale];
  }

  console.log(`  NPCs: ${Object.keys(result).length}`);
  return { localeNames, npcs: result };
}
