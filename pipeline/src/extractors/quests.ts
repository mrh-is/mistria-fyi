import { LOCALE_CODES } from "#lib/types/locale.js";

import {
  firstRequiredItemId,
  forEachQuest,
  QUEST_TYPE_BY_GROUP,
  TRACKED_QUEST_GROUPS,
} from "../extractor-helpers.js";
import { sourceFileFor } from "../parse-fiddle.js";

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
    const outputType = QUEST_TYPE_BY_GROUP[tomlType as keyof typeof QUEST_TYPE_BY_GROUP];
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
      const villager = extractQuestVillager(
        questId,
        quest,
        sourceFileFor(fiddle, `quests.${tomlType}`),
      );
      const itemId = extractFetchQuestItemId(questId, quest);
      const rewardRecipeId = extractRewardRecipeId(
        questId,
        quest,
        recipeIdByItemId,
        sourceFileFor(fiddle, `quests.${tomlType}`),
      );
      result.fetch[questId as QuestId] = {
        itemId: itemId as ItemId,
        villager,
        ...(rewardRecipeId ? { rewardRecipeId } : {}),
        sources: [],
      };
    } else if (outputType === "heart") {
      const villager = extractQuestVillager(
        questId,
        quest,
        sourceFileFor(fiddle, `quests.${tomlType}`),
      );
      const isPregnancy = questId.endsWith("_pregnancy_request");
      result.heart[questId as QuestId] = {
        heartLevel: isPregnancy ? 10 : 0,
        sources: [],
        villager,
      };
    } else if (outputType === "cooking") {
      const recipeId = extractCookingQuestRecipeId(questId, quest, recipeIdByItemId);
      result.cooking[questId as QuestId] = {
        recipeId,
        sources: [],
      };
    } else {
      result[outputType][questId as QuestId] = { sources: [] };
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

function extractRewardRecipeId(
  questId: string,
  quest: Record<string, unknown>,
  recipeIdByItemId: Map<string, RecipeId> | undefined,
  sourceFile: string,
): RecipeId | undefined {
  const rewards = quest.rewards as Record<string, unknown>[] | undefined;
  if (!Array.isArray(rewards)) return undefined;
  for (const reward of rewards) {
    let field: "crafting_scroll" | "recipe_scroll";
    if ("recipe_scroll" in reward) {
      field = "recipe_scroll";
    } else if ("crafting_scroll" in reward) {
      field = "crafting_scroll";
    } else {
      continue;
    }
    const itemId = reward[field];
    if (typeof itemId !== "string" || itemId.length === 0) {
      throw new TypeError(`Fetch quest "${questId}" has invalid ${field} in ${sourceFile}`);
    }
    const recipeId = recipeIdByItemId?.get(itemId);
    if (!recipeId) {
      throw new Error(
        `Fetch quest "${questId}" rewards ${field} "${itemId}" with no matching recipe in ${sourceFile}`,
      );
    }
    return recipeId;
  }
  return undefined;
}

function extractQuestVillager(
  questId: string,
  quest: Record<string, unknown>,
  sourceFile: string,
): VillagerId {
  const villager = quest.npc_for_icon ?? extractStageQueryVillager(quest);
  if (typeof villager !== "string" || villager.length === 0) {
    throw new Error(`Quest "${questId}" has no villager in ${sourceFile}`);
  }
  return villager as VillagerId;
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
