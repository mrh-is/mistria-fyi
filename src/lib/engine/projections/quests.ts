import { trackerData } from "#lib/data/index.js";
import { getCravingQuest, PREGNANCY_QUEST_IDS } from "#lib/engine/craving-quest.js";
import { isSpoilered } from "#lib/engine/projections/category-projection.js";
import { countShelfRows, shelfFacts } from "#lib/engine/shelves.js";
import { isConditionVisible } from "#lib/engine/visibility.js";
import { recordEntries } from "#lib/utils/record.js";

import type { CravingQuest } from "#lib/engine/craving-quest.js";
import type { ProgressContext } from "#lib/engine/progress.js";
import type {
  CategoryProjection,
  CategoryProjectionOptions,
  ChecklistRow,
} from "#lib/engine/projections/category-projection.js";
import type { Source } from "#lib/types/acquisition.js";
import type { QuestId, QuestType } from "#lib/types/tracker-data.js";

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
  for (const [questType, byType] of recordEntries(trackerData.quests)) {
    const typeOpen = isConditionVisible(
      trackerData.categoryVisibility[questType],
      ctx.progressionState,
    );
    for (const [id, quest] of recordEntries(byType)) {
      if (PREGNANCY_QUEST_IDS.has(id)) continue;
      const completed = ctx.progress.questStates[id] === "completed";
      const row = { sources: questSources(questType, id), visibility: quest.visibility };
      const facts = shelfFacts(row, completed, ctx, options.showsSource);
      rows.push({
        ...facts,
        doable: facts.doable && typeOpen,
        doableAnywhere: facts.doableAnywhere && typeOpen,
        id,
        spoilered: isSpoilered(quest.visibility, options.progressionState),
      });
    }
  }
  const craving = getCravingQuest(ctx.progress);
  const counted = craving.applicable
    ? [...rows, shelfFacts({ sources: [] }, craving.completed, ctx)]
    : rows;
  return { craving, rows, totals: countShelfRows(counted) };
}

export function questSources(questType: QuestType, questId: QuestId): Source[] {
  if (questType === "fetch") {
    const { itemId } = trackerData.quests.fetch[questId];
    return [...trackerData.items[itemId].sources];
  }
  if (questType === "cooking") {
    const quest = trackerData.quests.cooking[questId];
    const recipe = "recipeId" in quest ? trackerData.recipes[quest.recipeId] : undefined;
    if (recipe) return [...recipe.sources];
  }
  return [];
}
