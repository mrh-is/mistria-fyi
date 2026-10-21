import { expectArray, expectNumber, expectRecord } from "../data-shapes.js";
import { forEachQuest } from "../extractor-helpers.js";
import { sourceFileFor } from "../parse/parse-fiddle.js";

import type { QuestId, TownRank } from "#lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse/parse-fiddle.js";

/** Native rank quest IDs identify the family; their stage requirements supply the numeric mapping. */
export function extractTownRankQuestLevels(
  fiddle: ParsedGameData,
  townRanks: readonly TownRank[],
): Map<QuestId, number> {
  const levels = new Map<QuestId, number>();
  forEachQuest(fiddle, ["story_quests"], (_group, questId, quest) => {
    if (!/^reach_.+_town_rank$/u.test(questId)) return;
    const sourcePath = sourceFileFor(fiddle, "quests.story_quests");
    const context = { entityId: questId, sourcePath };
    const stages = expectArray<unknown>(quest.stages, { ...context, fieldPath: "stages" });
    if (stages.length !== 1) {
      throw new Error(
        `Town rank quest "${questId}" must have exactly one rank objective in ${sourcePath}`,
      );
    }
    const stage = expectRecord(stages[0], { ...context, fieldPath: "stages[0]" });
    const requirements = expectRecord(stage.requirements, {
      ...context,
      fieldPath: "stages[0].requirements",
    });
    if (!Object.hasOwn(requirements, "reached_renown_level")) {
      throw new Error(`Town rank quest "${questId}" has no renown requirement in ${sourcePath}`);
    }
    if (Object.keys(requirements).length !== 1) {
      throw new Error(`Town rank quest "${questId}" has additional requirements in ${sourcePath}`);
    }
    const level = expectNumber(requirements.reached_renown_level, {
      ...context,
      fieldPath: "stages[0].requirements.reached_renown_level",
    });
    if (!townRanks.some((rank) => rank.levels.start === level)) {
      throw new Error(
        `Town rank quest "${questId}" has no matching town rank for level ${level} in ${sourcePath}`,
      );
    }
    levels.set(questId as QuestId, level);
  });
  return levels;
}
