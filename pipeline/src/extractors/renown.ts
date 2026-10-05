import { LOCALE_CODES } from "#lib/types/locale.js";

import { expectArray } from "../data-shapes.js";
import { localizeField } from "../localize.js";
import { sourceFileFor } from "../parse-fiddle.js";

import type { LocaleCode } from "#lib/types/locale.js";
import type { TrackerData } from "#lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle.js";

export interface TownRankExtraction {
  localeNames: Record<LocaleCode, Record<string, string>>;
  townRanks: TrackerData["townRanks"];
}

const RANK_ENGLISH_NAMES = [
  "Wood",
  "Stone",
  "Copper",
  "Ruby",
  "Iron",
  "Sapphire",
  "Silver",
  "Emerald",
  "Gold",
  "Diamond",
  "Mistril",
] as const;

export function extractTownRanks(fiddle: ParsedGameData, assetsDir: string): TownRankExtraction {
  const localeNames = Object.fromEntries(LOCALE_CODES.map((locale) => [locale, {}])) as Record<
    LocaleCode,
    Record<string, string>
  >;
  const renown = fiddle.renown as Record<string, unknown> | undefined;
  if (!renown) return { localeNames, townRanks: [] };

  const levelsPerRank = (renown.levels_per_rank as number | undefined) ?? 10;

  const sourceFile = sourceFileFor(fiddle, "renown");
  const rawRanks = expectArray<Record<string, unknown>>(renown.ranks, {
    fieldPath: "renown.ranks",
    sourcePath: sourceFile,
  });

  // The game uses N-1 full ranks + 1 cap rank at the ceiling level
  const maxLevel = (rawRanks.length - 1) * levelsPerRank;
  const townRanks: TrackerData["townRanks"] = rawRanks.map((r, i) => {
    const name = r.name as string | undefined;
    if (!name) throw new Error(`Town rank at ordinal ${i} has no English name`);
    const { values } = localizeField(assetsDir, {
      category: "renown/ranks",
      classification: "localizable",
      englishValue: name,
      expectedEnglishValue: RANK_ENGLISH_NAMES[i],
      field: "name",
      id: i.toString(),
    });
    for (const locale of LOCALE_CODES) localeNames[locale][i.toString()] = values[locale];
    return {
      levels: {
        start: i * levelsPerRank,
        end: Math.min((i + 1) * levelsPerRank - 1, maxLevel),
      },
    };
  });

  console.log(`  Town ranks: ${townRanks.length} ranks, ${levelsPerRank} levels per rank`);
  return { localeNames, townRanks };
}
