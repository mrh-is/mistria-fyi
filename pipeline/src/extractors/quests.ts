import { forEachQuest, QUEST_TYPE_MAP, TRACKED_QUEST_GROUPS } from "../extractor-helpers.js";

import type { NpcId, QuestId, QuestType, TrackerData } from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle.js";

export function extractQuests(fiddle: ParsedGameData): TrackerData["quests"] {
  const quests = fiddle.quests as
    | Record<string, Record<string, Record<string, unknown>>>
    | undefined;
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
    const outputType = QUEST_TYPE_MAP[tomlType as keyof typeof QUEST_TYPE_MAP] as QuestType;
    const name = (quest.name as string | undefined) ?? questId;

    if (outputType === "fetch") {
      const npc = quest.npc_for_icon as string | undefined;
      result.fetch[questId as QuestId] = {
        name,
        npc: (npc ?? questId) as NpcId,
      };
    } else {
      (result[outputType] as Record<QuestId, { name: string }>)[questId as QuestId] = { name };
    }
  });

  const total = Object.values(result).reduce(
    (n, g) => n + Object.keys(g).length,
    0,
  );
  const breakdown = (Object.keys(result) as QuestType[])
    .map((t) => `${t}: ${Object.keys(result[t]).length}`)
    .join(", ");
  console.log(`  Quests: ${total} (${breakdown})`);
  return result;
}
