import { LOCALE_CODES } from "#lib/types/locale.js";

import { expectArray, expectNonEmptyString } from "../data-shapes.js";
import { minesBiomeId } from "../extractor-helpers.js";
import { sourceFileFor } from "../parse-fiddle.js";

import type { LocaleCode } from "#lib/types/locale.js";
import type {
  MinesBiome,
  MinesBiomeId,
  Spell,
  SpellId,
  TrackerData,
} from "#lib/types/tracker-data.js";

import type { Localizer } from "../localize.js";
import type { ParsedGameData } from "../parse-fiddle.js";

export interface MinesExtraction {
  biomeLocaleNames: Record<LocaleCode, Record<MinesBiomeId, string>>;
  mines: TrackerData["mines"];
  spellLocaleNames: Record<LocaleCode, Record<SpellId, string>>;
}

const BIOME_ENGLISH_NAMES = [
  "Upper Mines",
  "The Tide Caverns",
  "Deep Earth",
  "The Lava Caves",
  "Ancient Ruins",
] as const;

export function extractMines(fiddle: ParsedGameData, localizer: Localizer): MinesExtraction {
  const biomeLocaleNames = Object.fromEntries(LOCALE_CODES.map((locale) => [locale, {}])) as Record<
    LocaleCode,
    Record<MinesBiomeId, string>
  >;
  const dungeons = fiddle.dungeons as Record<string, unknown> | undefined;
  const spellsData = fiddle.spells as Record<string, Record<string, unknown>> | undefined;

  const dungeonsInner = dungeons?.dungeons as Record<string, unknown> | undefined;
  const misc = dungeons?.misc as Record<string, unknown> | undefined;
  const maxFloors = misc?.max_floors as number | undefined;
  if (typeof maxFloors !== "number") {
    throw new TypeError("Missing numeric dungeons.misc.max_floors");
  }

  const sourceFile = sourceFileFor(fiddle, "dungeons.dungeons.biomes");
  const rawBiomes = expectArray<Record<string, unknown>>(dungeonsInner?.biomes, {
    fieldPath: "dungeons.biomes",
    sourcePath: sourceFile,
  });

  const biomes: MinesBiome[] = rawBiomes.map((b, i) => {
    const name = expectNonEmptyString(b.name, {
      entityId: `dungeons.biomes[${i}]`,
      fieldPath: "name",
      sourcePath: sourceFile,
    });
    const start = b.floor;
    if (typeof start !== "number" || !Number.isInteger(start) || start < 1) {
      throw new TypeError(`Expected numeric floor for dungeons.biomes[${i}] in ${sourceFile}`);
    }
    const nextFloor = rawBiomes[i + 1]?.floor;
    if (
      i + 1 < rawBiomes.length &&
      (typeof nextFloor !== "number" || !Number.isInteger(nextFloor) || nextFloor < 1)
    ) {
      throw new TypeError(`Expected numeric floor for dungeons.biomes[${i + 1}] in ${sourceFile}`);
    }
    const end = i + 1 < rawBiomes.length ? (nextFloor as number) - 1 : maxFloors;
    const id = minesBiomeId(name);
    const { values } = localizer.localizeField({
      category: "dungeons/dungeons/biomes",
      classification: "localizable",
      englishValue: name,
      expectedEnglishValue: BIOME_ENGLISH_NAMES[i],
      field: "name",
      id: i.toString(),
    });
    for (const locale of LOCALE_CODES) biomeLocaleNames[locale][id] = values[locale];
    return {
      floors: { start, end },
      id,
    };
  });

  const spells = {} as Record<SpellId, Spell>;
  const spellLocaleNames = Object.fromEntries(LOCALE_CODES.map((locale) => [locale, {}])) as Record<
    LocaleCode,
    Record<SpellId, string>
  >;
  if (spellsData) {
    for (const [id, spell] of Object.entries(spellsData)) {
      if (id === "default") continue;
      spells[id as SpellId] = {
        sources: [],
      };
      const name = expectNonEmptyString(spell.name, {
        entityId: `spells.${id}`,
        fieldPath: "name",
        sourcePath: sourceFileFor(fiddle, `spells.${id}`),
      });
      const { values } = localizer.localizeField({
        category: "spells",
        classification: "localizable",
        englishValue: name,
        field: "name",
        id,
      });
      for (const locale of LOCALE_CODES) spellLocaleNames[locale][id as SpellId] = values[locale];
    }
  }

  const lastBiome = biomes.at(-1);
  console.log(
    `  Mines: ${biomes.length} biomes, ${lastBiome?.floors.end ?? 0} max floors, ${Object.keys(spells).length} spells`,
  );
  return { biomeLocaleNames, mines: { biomes, spells }, spellLocaleNames };
}
