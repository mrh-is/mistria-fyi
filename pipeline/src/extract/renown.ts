import { LOCALE_CODES } from "#lib/types/locale.js";

import { expectArray, expectNonEmptyString, expectRecord } from "../data-shapes.js";
import { RANK_ENGLISH_NAMES } from "../overrides/ordinal-names.js";
import { sourceFileFor } from "../parse/parse-fiddle.js";

import type { LocaleCode } from "#lib/types/locale.js";
import type { CosmeticId, ItemId, TrackerData } from "#lib/types/tracker-data.js";

import type { Localizer } from "../localize/localize.js";
import type { ParsedGameData } from "../parse/parse-fiddle.js";

export interface TownRankExtraction {
  localeNames: Record<LocaleCode, Record<string, string>>;
  townRanks: TrackerData["renown"]["townRanks"];
}

export function extractRenownRewards(
  fiddle: ParsedGameData,
  maxLevel: number,
): TrackerData["renown"]["rewards"] {
  const renown = fiddle.renown as Record<string, unknown> | undefined;
  if (!renown) return [];

  const sourcePath = sourceFileFor(fiddle, "renown");
  const rewards = expectArray<unknown>(renown.rewards, { fieldPath: "renown.rewards", sourcePath });
  if (rewards.length > maxLevel) {
    throw new Error(`Unexpected renown reward at level ${maxLevel + 1} in ${sourcePath}`);
  }

  return Array.from({ length: maxLevel }, (_, index) => {
    const level = index + 1;
    const context = { fieldPath: `renown reward at level ${level}`, sourcePath };
    const reward = expectRecord(rewards[index], context);
    if (Object.keys(reward).length === 1) {
      const { cosmetic, item, purse } = reward;
      if (typeof purse === "number" && Number.isSafeInteger(purse) && purse > 0) {
        return { type: "money", amount: purse };
      }
      if (Object.hasOwn(reward, "item")) {
        return { type: "item", itemId: expectNonEmptyString(item, context) as ItemId };
      }
      if (Object.hasOwn(reward, "cosmetic")) {
        return {
          type: "cosmetic",
          cosmeticId: expectNonEmptyString(cosmetic, context) as CosmeticId,
        };
      }
    }
    throw new Error(`Unrecognized renown reward at level ${level} in ${sourcePath}`);
  });
}

export function extractTownRanks(fiddle: ParsedGameData, localizer: Localizer): TownRankExtraction {
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
  const townRanks: TrackerData["renown"]["townRanks"] = rawRanks.map((r, i) => {
    const name = r.name as string | undefined;
    if (!name) throw new Error(`Town rank at ordinal ${i} has no English name`);
    const { values } = localizer.localizeField({
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
