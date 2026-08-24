import { forEachQuest, QUEST_TYPE_MAP, TRACKED_QUEST_GROUPS } from "../extractor-helpers.js";

import type { SourceTuple } from "$lib/types/acquisition.js";
import type { ItemId, NpcId, QuestId, QuestType, TrackerData } from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle.js";

export function extractQuests(fiddle: ParsedGameData): TrackerData["quests"] {
  const quests = fiddle.quests as
    Record<string, Record<string, Record<string, unknown>>> | undefined;
  if (!quests) {
    return { cooking: {}, crown: {}, fetch: {}, heart: {}, mission: {}, story: {} };
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

    if (outputType === "fetch") {
      const npc = quest.npc_for_icon as string | undefined;
      const itemId = extractFetchQuestItemId(questId, quest);
      result.fetch[questId as QuestId] = {
        itemId: itemId as ItemId,
        name,
        npc: (npc ?? questId) as NpcId,
        sources: [] as unknown as SourceTuple,
      };
    } else {
      (result[outputType] as Record<QuestId, { name: string; sources: SourceTuple }>)[
        questId as QuestId
      ] = { name, sources: [] as unknown as SourceTuple };
    }
  });

  const total = Object.values(result).reduce((n, g) => n + Object.keys(g).length, 0);
  const breakdown = (Object.keys(result) as QuestType[])
    .map((t) => `${t}: ${Object.keys(result[t]).length}`)
    .join(", ");
  console.log(`  Quests: ${total} (${breakdown})`);
  return result;
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
