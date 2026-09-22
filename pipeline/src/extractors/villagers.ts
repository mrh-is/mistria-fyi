import { LOCALE_CODES } from "$lib/types/locale.js";

import { localizeField } from "../localize";

import type { LocaleCode } from "$lib/types/locale.js";
import type { Season, TrackerData, VillagerId } from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle";

export interface VillagerExtraction {
  /** The game's `icon_sprite` name per villager, keyed by villager ID. See {@link VillagerIconSpriteIndex}. */
  iconSpritesByVillagerId: VillagerIconSpriteIndex;
  /** Per-locale `villagers` name chunks, written to `src/lib/data/locales/<tag>/villagers.json`. */
  localeNames: Record<LocaleCode, Record<VillagerId, string>>;
  /** The structural villager records. Player-facing names live in {@link localeNames}, not here. */
  villagers: TrackerData["villagers"];
}

/**
 * The game's `icon_sprite` name per villager, keyed by villager ID. Used only to locate the source
 * PNG during sprite extraction; the final `Villager` in `tracker-data.json` has no icon field, since
 * sprite URLs are resolved from the villager ID itself (see `src/lib/sprites/sprite-url.ts`).
 */
export type VillagerIconSpriteIndex = Record<string, string>;

/**
 * Extracts villager records plus their per-locale display names.
 *
 * `name` is deliberately absent from the emitted {@link TrackerData} records: a field that doesn't
 * exist on the type is the guardrail against rendering untranslated data. Callers resolve names
 * through `getName("villagers", id, locale)` instead.
 */
export function extractVillagers(fiddle: ParsedGameData, assetsDir: string): VillagerExtraction {
  const localeNames = Object.fromEntries(LOCALE_CODES.map((locale) => [locale, {}])) as Record<
    LocaleCode,
    Record<VillagerId, string>
  >;

  // "npcs" here is the game's own asset folder / localization key namespace, not our naming.
  const npcs = fiddle.npcs as Record<string, Record<string, unknown>> | undefined;
  if (!npcs) return { iconSpritesByVillagerId: {}, localeNames, villagers: {} };

  const result = {} as Record<VillagerId, TrackerData["villagers"][VillagerId]>;
  const iconSpritesByVillagerId: VillagerIconSpriteIndex = {};
  for (const [id, npc] of Object.entries(npcs)) {
    if (id === "default") continue;

    const name = npc.name as string | undefined;
    if (!name) continue;

    const birthday = npc.birthday as undefined | { day?: number; season?: string };
    if (!birthday?.season || typeof birthday.day !== "number") continue;

    const iconSprite = npc.icon_sprite as string | undefined;
    if (!iconSprite) {
      throw new Error(`Missing icon_sprite for villager "${id}"`);
    }

    const dateable = npc.dateable === true;

    result[id as VillagerId] = {
      birthday: {
        day: birthday.day,
        season: birthday.season as Season,
      },
      ...(dateable ? { dateable } : {}),
    };
    iconSpritesByVillagerId[id] = iconSprite;

    const { values } = localizeField(assetsDir, {
      category: "npcs",
      classification: "localizable",
      englishValue: name,
      field: "name",
      id,
    });

    for (const locale of LOCALE_CODES) localeNames[locale][id as VillagerId] = values[locale];
  }

  console.log(`  Villagers: ${Object.keys(result).length}`);
  return { iconSpritesByVillagerId, localeNames, villagers: result };
}
