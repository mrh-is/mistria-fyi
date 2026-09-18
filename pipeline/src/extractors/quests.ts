import { LOCALE_CODES } from "$lib/types/locale.js";

import { forEachQuest, QUEST_TYPE_MAP, TRACKED_QUEST_GROUPS } from "../extractor-helpers";
import { localizeField } from "../localize";

import type { SourceTuple } from "$lib/types/acquisition.js";
import type { LocaleCode } from "$lib/types/locale.js";
import type {
  ItemId,
  NpcId,
  QuestId,
  QuestType,
  RecipeId,
  TrackerData,
} from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle";

export function extractQuests(
  fiddle: ParsedGameData,
  assetsDir: string,
  recipeIdByItemId?: Map<string, RecipeId>,
): { localeNames: Record<LocaleCode, Record<QuestId, string>>; quests: TrackerData["quests"] } {
  const localeNames = Object.fromEntries(LOCALE_CODES.map((locale) => [locale, {}])) as Record<
    LocaleCode,
    Record<QuestId, string>
  >;
  const quests = fiddle.quests as
    Record<string, Record<string, Record<string, unknown>>> | undefined;
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
    const { values } = localizeField(assetsDir, {
      category: `quests/${tomlType}`,
      classification: "localizable",
      englishValue: name,
      field: "name",
      id: questId,
    });
    for (const locale of LOCALE_CODES) localeNames[locale][questId as QuestId] = values[locale];

    if (outputType === "fetch") {
      const npc = quest.npc_for_icon as string | undefined;
      const itemId = extractFetchQuestItemId(questId, quest);
      const rewardRecipeId = extractRewardRecipeId(quest);
      result.fetch[questId as QuestId] = {
        itemId: itemId as ItemId,
        npc: (npc ?? questId) as NpcId,
        ...(rewardRecipeId ? { rewardRecipeId: rewardRecipeId as RecipeId } : {}),
        sources: [] as unknown as SourceTuple,
      };
    } else if (outputType === "heart") {
      const npc = quest.npc_for_icon as string | undefined;
      const isPregnancy = questId.endsWith("_pregnancy_request");
      result.heart[questId as QuestId] = {
        heartLevel: isPregnancy ? 10 : 0,
        npc: (npc ?? extractStageQueryNpc(quest) ?? questId) as NpcId,
        sources: [] as unknown as SourceTuple,
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
  const stages = quest.stages as Record<string, unknown>[] | undefined;
  if (Array.isArray(stages)) {
    for (const stage of stages) {
      const requirements = stage.requirements as Record<string, unknown> | undefined;
      const hasItem = requirements?.has_item;
      let itemId: string | undefined;
      if (typeof hasItem === "string") {
        itemId = hasItem;
      } else if (Array.isArray(hasItem) && hasItem.length > 0) {
        const first: unknown = hasItem[0];
        if (typeof first === "object" && first !== null) {
          itemId = Object.keys(first)[0];
        }
      } else if (typeof hasItem === "object" && hasItem !== null) {
        itemId = Object.keys(hasItem)[0];
      }
      if (itemId) {
        const recipeId = recipeIdByItemId?.get(itemId);
        if (recipeId) return recipeId;
        throw new Error(
          `Cooking quest "${questId}" requires item "${itemId}" which has no matching recipe`,
        );
      }
    }
  }
  throw new Error(`Cooking quest "${questId}" has no has_item requirement in any stage`);
}

function extractFetchQuestItemId(questId: string, quest: Record<string, unknown>): string {
  const stages = quest.stages as Record<string, unknown>[] | undefined;
  if (Array.isArray(stages)) {
    for (const stage of stages) {
      const requirements = stage.requirements as Record<string, unknown> | undefined;
      const hasItem = requirements?.has_item;
      if (typeof hasItem === "string") return hasItem;
      if (Array.isArray(hasItem) && hasItem.length > 0) {
        const first: unknown = hasItem[0];
        if (typeof first === "object" && first !== null) {
          return Object.keys(first)[0];
        }
      }
      if (typeof hasItem === "object" && hasItem !== null && !Array.isArray(hasItem)) {
        return Object.keys(hasItem)[0];
      }
    }
  }
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

function extractStageQueryNpc(quest: Record<string, unknown>): string | undefined {
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
