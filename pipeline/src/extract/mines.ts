import { LOCALE_CODES } from "#lib/types/locale.js";

import { expectArray, expectNonEmptyString } from "../data-shapes.js";
import { minesBiomeId } from "../extractor-helpers.js";
import { MINE_SEAL_FLOORS, SEALS_OFF_THE_FLOORS } from "../overrides/game-facts.js";
import { BIOME_ENGLISH_NAMES } from "../overrides/ordinal-names.js";
import { sourceFileFor } from "../parse/parse-fiddle.js";

import type { MonsterId } from "#lib/types/acquisition.js";
import type { LocaleCode } from "#lib/types/locale.js";
import type {
  MinesBiome,
  MinesBiomeId,
  MineSeal,
  MineSealId,
  QuestId,
  Spell,
  SpellId,
  TrackerData,
} from "#lib/types/tracker-data.js";
import type { NonEmptyArray } from "#lib/utils/record.js";

import type { Localizer } from "../localize/localize.js";
import type { ParsedGameData } from "../parse/parse-fiddle.js";

export interface MinesExtraction {
  biomeLocaleNames: Record<LocaleCode, Record<MinesBiomeId, string>>;
  mines: TrackerData["mines"];
  spellLocaleNames: Record<LocaleCode, Record<SpellId, string>>;
}

/** Each seal on a mine floor, in floor order. A seal with no known floor throws. */
function extractSeals(fiddle: ParsedGameData): MineSeal[] {
  const raw = fiddle.seals as Record<string, Record<string, unknown>> | undefined;
  if (!raw) throw new TypeError("Missing seals table");
  const sourcePath = sourceFileFor(fiddle, "seals");
  const seals: MineSeal[] = [];
  for (const [id, seal] of Object.entries(raw)) {
    if (SEALS_OFF_THE_FLOORS.has(id)) continue;
    const floor = MINE_SEAL_FLOORS[id];
    if (floor === undefined) throw new TypeError(`No mine floor recorded for seal ${id}`);
    const { stage } = seal;
    if (typeof stage !== "number" || !Number.isInteger(stage) || stage < 0) {
      throw new TypeError(`Expected numeric stage for seal ${id} in ${sourcePath}`);
    }
    const questId = expectNonEmptyString(seal.quest, {
      entityId: `seals.${id}`,
      fieldPath: "quest",
      sourcePath,
    }) as QuestId;
    seals.push({ floor, id: id as MineSealId, questId, stage });
  }
  return seals.toSorted((a, b) => a.floor - b.floor);
}

function extractMonsterBiomes(
  rawBiomes: Record<string, unknown>[],
  biomes: MinesBiome[],
  monsters: ParsedGameData["monsters"],
): TrackerData["mines"]["monsters"] {
  const spawns = new Map<MonsterId, { biomes: NonEmptyArray<MinesBiomeId> }>();
  function add(monster: MonsterId, biome: MinesBiomeId): void {
    const existing = spawns.get(monster);
    if (!existing) spawns.set(monster, { biomes: [biome] });
    else if (!existing.biomes.includes(biome)) existing.biomes.push(biome);
  }

  for (const [index, biome] of rawBiomes.entries()) {
    const votes = biome.votes as Record<string, { object: MonsterId }[]> | undefined;
    for (const kind of ["enemy", "mini_boss_enemy"]) {
      for (const { object } of votes?.[kind] ?? []) add(object, biomes[index].id);
    }
  }
  const saplings = (
    monsters as undefined | { sap?: Record<string, { sap_children_species?: MonsterId }> }
  )?.sap;
  for (const [parent, { sap_children_species: child }] of Object.entries(saplings ?? {})) {
    if (!child) continue;
    for (const biome of spawns.get(parent as MonsterId)?.biomes ?? []) add(child, biome);
  }
  return Object.fromEntries(spawns);
}

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
  return {
    biomeLocaleNames,
    mines: {
      biomes,
      monsters: extractMonsterBiomes(rawBiomes, biomes, fiddle.monsters),
      seals: extractSeals(fiddle),
      spells,
    },
    spellLocaleNames,
  };
}
