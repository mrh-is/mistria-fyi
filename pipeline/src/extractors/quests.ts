import { forEachQuest, TRACKED_QUEST_GROUPS } from "../extractor-helpers.js";

import type { QuestId, TrackerData } from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle.js";

export function extractQuests(fiddle: ParsedGameData): TrackerData["quests"] {
  const result = {} as Record<string, Record<QuestId, { name: string; npc?: string }>>;

  forEachQuest(fiddle, TRACKED_QUEST_GROUPS, (questType, questId, quest) => {
    const group = (result[questType] ??= {} as Record<QuestId, { name: string; npc?: string }>);
    const npc = quest.npc_for_icon as string | undefined;
    group[questId as QuestId] = {
      name: (quest.name as string | undefined) ?? questId,
      ...(npc ? { npc } : {}),
    };
  });

  const total = Object.values(result).reduce((n, g) => n + Object.keys(g).length, 0);
  console.log(
    `  Quests: ${total} (${TRACKED_QUEST_GROUPS.map((t) => `${t}: ${Object.keys(result[t] ?? {}).length}`).join(", ")})`,
  );
  return result;
}
