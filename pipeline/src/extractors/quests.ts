import type { QuestId, TrackerData } from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle.js";

// These six allowlisted keys are TOML group/file names; request-board and registry siblings are excluded.
const QUEST_TYPES = [
  "story_quests",
  "heart_quests",
  "fetch_quests",
  "crown_quests",
  "stillwell_challenges",
  "tali_challenges",
];

export function extractQuests(fiddle: ParsedGameData): TrackerData["quests"] {
  const quests = fiddle.quests as
    Record<string, Record<string, Record<string, unknown>>> | undefined;
  if (!quests) return {} as TrackerData["quests"];

  const result = {} as Record<string, Record<QuestId, { name: string; npc?: string }>>;

  for (const questType of QUEST_TYPES) {
    const questGroup = quests[questType];
    if (!questGroup) continue;

    const group = {} as Record<QuestId, { name: string; npc?: string }>;
    for (const [id, quest] of Object.entries(questGroup)) {
      if (id === "default") continue;
      const npc = quest.npc_for_icon as string | undefined;
      group[id as QuestId] = {
        name: (quest.name as string | undefined) ?? id,
        ...(npc ? { npc } : {}),
      };
    }

    result[questType] = group;
  }

  const total = Object.values(result).reduce((n, g) => n + Object.keys(g).length, 0);
  console.log(
    `  Quests: ${total} (${QUEST_TYPES.map((t) => `${t}: ${Object.keys(result[t] ?? {}).length}`).join(", ")})`,
  );
  return result;
}
