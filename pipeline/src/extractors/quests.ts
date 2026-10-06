import { LOCALE_CODES } from "#lib/types/locale.js";

import {
  firstRequiredItemId,
  forEachQuest,
  QUEST_TYPE_MAP,
  TRACKED_QUEST_GROUPS,
} from "../extractor-helpers.js";

import type { SourceTuple } from "#lib/types/acquisition.js";
import type { LocaleCode } from "#lib/types/locale.js";
import type {
  ItemId,
  QuestId,
  QuestType,
  RecipeId,
  TrackerData,
  VillagerId,
} from "#lib/types/tracker-data.js";

import type { Localizer } from "../localize.js";
import type { ParsedGameData } from "../parse-fiddle.js";

export function extractQuests(
  fiddle: ParsedGameData,
  localizer: Localizer,
  recipeIdByItemId?: Map<string, RecipeId>,
): { localeNames: Record<LocaleCode, Record<QuestId, string>>; quests: TrackerData["quests"] } {
  const localeNames = Object.fromEntries(LOCALE_CODES.map((locale) => [locale, {}])) as Record<
    LocaleCode,
    Record<QuestId, string>
  >;
  const quests = fiddle.quests as
    | Record<string, Record<string, Record<string, unknown>>>
    | undefined;
  if (!quests) {
    return {
      localeNames,
      quests: { cooking: {}, crown: {}, fetch: {}, heart: {}, mission: {}, story: {} },
    };
  }

  const result: TrackerData["quests"] = {
    cooking: {},
    crown: {},
    fetch: {},
    heart: {},
    mission: {},
    story: {},
  };

  forEachQuest(fiddle, TRACKED_QUEST_GROUPS, (tomlType, questId, quest) => {
    const outputType = QUEST_TYPE_MAP[tomlType as keyof typeof QUEST_TYPE_MAP];
    const name = (quest.name as string | undefined) ?? questId;
    const { values } = localizer.localizeField({
      category: `quests/${tomlType}`,
      classification: "localizable",
      englishValue: name,
      field: "name",
      id: questId,
    });
    for (const locale of LOCALE_CODES) localeNames[locale][questId as QuestId] = values[locale];

    if (outputType === "fetch") {
      const villager = quest.npc_for_icon as string | undefined;
      const itemId = extractFetchQuestItemId(questId, quest);
      const rewardRecipeId = extractRewardRecipeId(quest);
      result.fetch[questId as QuestId] = {
        itemId: itemId as ItemId,
        villager: (villager ?? questId) as VillagerId,
        ...(rewardRecipeId ? { rewardRecipeId: rewardRecipeId as RecipeId } : {}),
        sources: [] as unknown as SourceTuple,
      };
    } else if (outputType === "heart") {
      const villager = quest.npc_for_icon as string | undefined;
      const isPregnancy = questId.endsWith("_pregnancy_request");
      result.heart[questId as QuestId] = {
        heartLevel: isPregnancy ? 10 : 0,
        sources: [] as unknown as SourceTuple,
        villager: (villager ?? extractStageQueryVillager(quest) ?? questId) as VillagerId,
      };
    } else if (outputType === "cooking") {
      const recipeId = extractCookingQuestRecipeId(questId, quest, recipeIdByItemId);
      result.cooking[questId as QuestId] = {
        recipeId,
        sources: [] as unknown as SourceTuple,
      };
    } else {
      (result[outputType] as Record<QuestId, { sources: SourceTuple }>)[questId as QuestId] = {
        sources: [] as unknown as SourceTuple,
      };
    }
  });

  const total = Object.values(result).reduce((n, g) => n + Object.keys(g).length, 0);
  const breakdown = (Object.keys(result) as QuestType[])
    .map((t) => `${t}: ${Object.keys(result[t]).length}`)
    .join(", ");
  console.log(`  Quests: ${total} (${breakdown})`);
  return { localeNames, quests: result };
}

function extractCookingQuestRecipeId(
  questId: string,
  quest: Record<string, unknown>,
  recipeIdByItemId: Map<string, RecipeId> | undefined,
): RecipeId {
  const itemId = firstRequiredItemId(questId, quest);
  if (!itemId) {
    throw new Error(`Cooking quest "${questId}" has no has_item requirement in any stage`);
  }
  const recipeId = recipeIdByItemId?.get(itemId);
  if (recipeId) return recipeId;
  throw new Error(
    `Cooking quest "${questId}" requires item "${itemId}" which has no matching recipe`,
  );
}

function extractFetchQuestItemId(questId: string, quest: Record<string, unknown>): string {
  const itemId = firstRequiredItemId(questId, quest);
  if (itemId) return itemId;
  throw new Error(`Fetch quest "${questId}" has no has_item requirement in any stage`);
}

function extractRewardRecipeId(quest: Record<string, unknown>): string | undefined {
  const rewards = quest.rewards as Record<string, unknown>[] | undefined;
  if (!Array.isArray(rewards)) return undefined;
  for (const reward of rewards) {
    if (typeof reward.recipe_scroll === "string") return reward.recipe_scroll;
  }
  return undefined;
}

function extractStageQueryVillager(quest: Record<string, unknown>): string | undefined {
  const stages = quest.stages as Record<string, unknown>[] | undefined;
  if (!Array.isArray(stages)) return undefined;
  for (const stage of stages) {
    const queries = stage.queries as Record<string, unknown>[] | undefined;
    if (!Array.isArray(queries)) continue;
    for (const query of queries) {
      if (typeof query.npc === "string") return query.npc;
    }
  }
  return undefined;
}
