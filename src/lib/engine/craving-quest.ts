import { trackerData } from "#lib/data/index.js";
import { getMarriedVillager } from "#lib/engine/relationships.js";
import { recordValues } from "#lib/utils/record.js";

import type { QuestId, VillagerId } from "#lib/types/tracker-data.js";
import type { CompletedState } from "#lib/types/user-progress.js";
import type { DeepReadonly } from "#lib/utils/deep-readonly.js";

/**
 * The craving quest: one synthetic quest row standing in for every spouse's pregnancy quest.
 * Before marriage it's a placeholder; once married, it tracks the spouse's own pregnancy quest,
 * and it drops out entirely when the spouse has none or the household chose no children.
 */
export interface CravingQuest {
  /** Whether the row counts toward quest progress (and renders). */
  applicable: boolean;
  completed: boolean;
  /** The spouse's pregnancy quest; absent before marriage or when the spouse has none. */
  questId?: QuestId;
  villagerId?: VillagerId;
}

/** Every Villager's pregnancy quest. They surface only through the craving quest, never alone. */
export const PREGNANCY_QUEST_IDS: ReadonlySet<QuestId> = new Set(
  recordValues(trackerData.pregnancyQuestByVillager),
);

export function getCravingQuest(completed: DeepReadonly<CompletedState>): CravingQuest {
  const villagerId = getMarriedVillager(completed.villagerRelationships) ?? undefined;
  if (!villagerId) return { applicable: true, completed: false, questId: undefined, villagerId };

  const questId = trackerData.pregnancyQuestByVillager[villagerId];
  if (!questId || completed.childChoice === "no") {
    return { applicable: false, completed: false, questId, villagerId };
  }
  return {
    applicable: true,
    completed: completed.questStates[questId] === "completed",
    questId,
    villagerId,
  };
}
