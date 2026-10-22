import { trackerData } from "#lib/data/index.js";
import { getCravingQuest, PREGNANCY_QUEST_IDS } from "#lib/engine/craving-quest.js";
import { countChecklist, isSpoilered } from "#lib/engine/projections/category-projection.js";
import { recordEntries } from "#lib/utils/record.js";

import type { CravingQuest } from "#lib/engine/craving-quest.js";
import type { ProgressContext } from "#lib/engine/progress.js";
import type {
  CategoryProjection,
  CategoryProjectionOptions,
  ChecklistRow,
} from "#lib/engine/projections/category-projection.js";
import type { QuestId } from "#lib/types/tracker-data.js";

export interface QuestRow extends ChecklistRow {
  id: QuestId;
}

export interface QuestsProjection extends CategoryProjection {
  /** The one row standing in for every pregnancy quest; it counts only while applicable. */
  craving: CravingQuest;
  /** Every quest except pregnancy quests, which surface only through `craving`. */
  rows: QuestRow[];
}

export function projectQuests(
  ctx: ProgressContext,
  options: CategoryProjectionOptions = {},
): QuestsProjection {
  const rows: QuestRow[] = [];
  for (const byType of Object.values(trackerData.quests)) {
    for (const [id, quest] of recordEntries(byType)) {
      if (PREGNANCY_QUEST_IDS.has(id)) continue;
      rows.push({
        completed: ctx.progress.questStates[id] === "completed",
        id,
        inScope: true,
        spoilered: isSpoilered(quest.visibility, options.progressionState),
      });
    }
  }
  const craving = getCravingQuest(ctx.progress);
  const counted = craving.applicable
    ? [...rows, { completed: craving.completed, inScope: true, spoilered: false }]
    : rows;
  return { craving, rows, totals: countChecklist(counted) };
}
