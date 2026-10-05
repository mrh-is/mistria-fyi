import { LOCALE_CODES } from "#lib/types/locale.js";

import { localizeField } from "../localize.js";

import type { LocaleCode } from "#lib/types/locale.js";
import type { Season, TrackerData, VillagerId } from "#lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle.js";

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

interface RawVillagerRecord {
  birthday: { day: number; season: Season };
  dateable: boolean;
  iconSprite?: string;
  id: string;
  name: string;
}

/**
 * Builds only the villager icon-sprite index, with no localization lookup and no disk reads beyond
 * `fiddle` itself. Lets sprite-only pipeline runs work directly off `assets.zip` (see
 * `pnpm run pipeline -- <path> --villager-sprites-only` in `pipeline/README.md`), where per-locale name
 * files aren't available without a full on-disk asset extraction.
 */
export function extractVillagerIconSprites(fiddle: ParsedGameData): VillagerIconSpriteIndex {
  const iconSpritesByVillagerId: VillagerIconSpriteIndex = {};
  for (const record of collectVillagerRecords(fiddle)) {
    if (!record.iconSprite) {
      throw new Error(`Missing icon_sprite for villager "${record.id}"`);
    }
    iconSpritesByVillagerId[record.id] = record.iconSprite;
  }
  return iconSpritesByVillagerId;
}

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

  const records = collectVillagerRecords(fiddle, false);
  const result = {} as Record<VillagerId, TrackerData["villagers"][VillagerId]>;
  const iconSpritesByVillagerId: VillagerIconSpriteIndex = {};

  for (const record of records) {
    result[record.id as VillagerId] = {
      birthday: record.birthday,
      ...(record.dateable ? { dateable: record.dateable } : {}),
    };
    if (record.iconSprite) {
      iconSpritesByVillagerId[record.id] = record.iconSprite;
    }

    const { values } = localizeField(assetsDir, {
      category: "npcs",
      classification: "localizable",
      englishValue: record.name,
      field: "name",
      id: record.id,
    });

    for (const locale of LOCALE_CODES) {
      localeNames[locale][record.id as VillagerId] = values[locale];
    }
  }

  console.log(`  Villagers: ${records.length}`);
  return { iconSpritesByVillagerId, localeNames, villagers: result };
}

/**
 * Walks `fiddle.npcs` once, applying every villager's acceptance rules (present name, valid
 * birthday, and optionally required `icon_sprite`). Shared by {@link extractVillagers} and
 * {@link extractVillagerIconSprites} so both agree on exactly which IDs count as real villagers.
 */
function collectVillagerRecords(
  fiddle: ParsedGameData,
  requireIconSprite = true,
): RawVillagerRecord[] {
  // "npcs" here is the game's own asset folder / localization key namespace, not our naming.
  const npcs = fiddle.npcs as Record<string, Record<string, unknown>> | undefined;
  if (!npcs) return [];

  const records: RawVillagerRecord[] = [];
  for (const [id, npc] of Object.entries(npcs)) {
    if (id === "default") continue;

    const name = npc.name as string | undefined;
    if (!name) continue;

    const birthday = npc.birthday as undefined | { day?: number; season?: string };
    if (!birthday?.season || typeof birthday.day !== "number") continue;

    const iconSprite = npc.icon_sprite as string | undefined;
    if (requireIconSprite && !iconSprite) {
      throw new Error(`Missing icon_sprite for villager "${id}"`);
    }

    records.push({
      birthday: { day: birthday.day, season: birthday.season as Season },
      dateable: npc.dateable === true,
      iconSprite,
      id,
      name,
    });
  }
  return records;
}
