import { trackerData, trackerIndex } from "#lib/data/index.js";
import { isAvailabilityDoable } from "#lib/engine/availability.js";
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
import type { ShelfRow } from "#lib/engine/shelves.js";
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
      // Obtained quests have already passed their start gate, including seasonal board posting.
      const canStart =
        ctx.progress.questStates[id] === "obtained" ||
        isAvailabilityDoable(quest.startCondition, ctx, {
          acquiredItems: {
            get: (itemId) => {
              const canonical = trackerIndex.memberToCanonicalAlmanacId.get(itemId);
              return canonical === undefined ? undefined : ctx.progress.almanac.has(canonical);
            },
          },
        });
      rows.push({
        ...facts,
        doable: facts.doable && typeOpen && canStart,
        doableAnywhere: facts.doableAnywhere && typeOpen && canStart,
        id,
        spoilered: isSpoilered(quest.visibility, options.progressionState),
      });
    }
  }
  const craving = getCravingQuest(ctx.progress);
  const counted = craving.applicable ? [...rows, cravingFacts(craving, ctx)] : rows;
  return { craving, rows, totals: countShelfRows(counted) };
}

/** Before marriage the craving row stands in for a quest that doesn't exist yet, so it waits. */
export function cravingFacts(
  { completed, questId }: Pick<CravingQuest, "completed" | "questId">,
  ctx: ProgressContext,
): ShelfRow {
  const facts = shelfFacts({ sources: [] }, completed, ctx);
  return questId ? facts : { ...facts, doable: false, doableAnywhere: false };
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
