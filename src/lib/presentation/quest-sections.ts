import { trackerData } from "#lib/data/index.js";
import { getName, nameCollator } from "#lib/data/names.js";
import { getCravingQuest, PREGNANCY_QUEST_IDS } from "#lib/engine/craving-quest.js";
import * as m from "#lib/paraglide/messages.js";
import { displayQuestName } from "#lib/utils/en-grammar.js";
import { recordEntries } from "#lib/utils/record.js";

import type { Source } from "#lib/types/acquisition.js";
import type { LocaleCode } from "#lib/types/locale.js";
import type { QuestId, QuestType, VillagerId } from "#lib/types/tracker-data.js";
import type { ProgressState } from "#lib/types/user-progress.js";
import type { VisibilityCondition } from "#lib/types/visibility.js";
import type { DeepReadonly } from "#lib/utils/deep-readonly.js";

/** The quests page's section order. */
export const QUEST_TYPE_ORDER: readonly QuestType[] = [
  "story",
  "heart",
  "fetch",
  "crown",
  "mission",
  "cooking",
];

/** The synthetic craving row's key before marriage, when no pregnancy quest backs it. */
export const CRAVING_PLACEHOLDER_ID = "craving_synthetic" as QuestId;

/** One quest from tracker data. Its state comes from the store at render time. */
export interface QuestEntryRow {
  displayName: string;
  id: QuestId;
  kind: "quest";
  sources: Source[];
  subtitle?: string;
  visibility?: VisibilityCondition;
}

/** The craving quest, standing in for the spouse's pregnancy quest. */
export interface CravingQuestRow {
  completed: boolean;
  displayName: string;
  /** The row's key: the spouse's pregnancy quest, or `CRAVING_PLACEHOLDER_ID` before marriage. */
  id: QuestId;
  kind: "craving";
  /** The pregnancy quest the row toggles; absent before marriage, when the row is inert. */
  questId?: QuestId;
  subtitle?: string;
  villager?: VillagerId;
}

export type QuestRow = CravingQuestRow | QuestEntryRow;

export interface QuestSection {
  questType: QuestType;
  rows: QuestRow[];
}

/** Sort keys that the section comparator reads but that the rendered rows don't need. */
interface SortableRow {
  heartLevel?: number;
  row: QuestRow;
  villager?: VillagerId;
}

/**
 * Every quest section in display order, rows sorted and labeled. Pregnancy quests never appear on
 * their own; the craving row stands in for them at the end of the heart section, and it drops out
 * when it doesn't apply. Sections with no rows are omitted.
 */
export function buildQuestSections(
  completed: DeepReadonly<ProgressState>,
  locale: LocaleCode,
): QuestSection[] {
  const sections: QuestSection[] = [];
  for (const questType of QUEST_TYPE_ORDER) {
    const sortable = recordEntries(trackerData.quests[questType])
      .filter(([id]) => !PREGNANCY_QUEST_IDS.has(id))
      .map(([id]) => questRow(questType, id, locale));
    if (questType === "heart") {
      const craving = cravingRow(completed, locale);
      if (craving) sortable.push(craving);
    }
    if (sortable.length === 0) continue;

    sortable.sort(comparator(questType, locale));
    const duplicateNames = findDuplicateNames(sortable.map(({ row }) => row.displayName));
    const rows = sortable.map(({ row, villager }) =>
      row.kind === "quest"
        ? { ...row, subtitle: questSubtitle(row, villager, questType, duplicateNames, locale) }
        : row,
    );
    sections.push({ questType, rows });
  }
  return sections;
}

function comparator(
  questType: QuestType,
  locale: LocaleCode,
): (a: SortableRow, b: SortableRow) => number {
  const chainOrder = trackerData.questOrder[questType];
  const collator = nameCollator(locale);
  const villagerName = (villager?: VillagerId): string =>
    villager ? getName("villagers", villager, locale) : "";

  return (a, b) => {
    if (chainOrder) {
      const aIdx = chainOrder.indexOf(a.row.id);
      const bIdx = chainOrder.indexOf(b.row.id);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
    }
    if (questType === "heart") {
      const aCraving = a.row.kind === "craving";
      if (aCraving !== (b.row.kind === "craving")) return aCraving ? 1 : -1;
      const villagerCmp = collator.compare(villagerName(a.villager), villagerName(b.villager));
      if (villagerCmp !== 0) return villagerCmp;
      return (a.heartLevel ?? 0) - (b.heartLevel ?? 0);
    }
    const nameCmp = collator.compare(a.row.displayName, b.row.displayName);
    if (nameCmp !== 0 || questType !== "fetch") return nameCmp;
    return collator.compare(villagerName(a.villager), villagerName(b.villager));
  };
}

function cravingRow(
  completed: DeepReadonly<ProgressState>,
  locale: LocaleCode,
): SortableRow | undefined {
  const craving = getCravingQuest(completed);
  if (!craving.applicable) return undefined;
  return {
    heartLevel: 99,
    row: {
      completed: craving.completed,
      displayName: m.quest_craving_name({}, { locale }),
      id: craving.questId ?? CRAVING_PLACEHOLDER_ID,
      kind: "craving",
      questId: craving.questId,
      subtitle:
        craving.questId && craving.villager
          ? getName("villagers", craving.villager, locale)
          : undefined,
      villager: craving.villager,
    },
    villager: craving.villager,
  };
}

function findDuplicateNames(names: string[]): Set<string> {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return new Set([...counts].filter(([, count]) => count > 1).map(([name]) => name));
}

function questRow(questType: QuestType, id: QuestId, locale: LocaleCode): SortableRow {
  const base = {
    id,
    kind: "quest" as const,
    sources: questSources(questType, id),
    visibility: trackerData.quests[questType][id].visibility,
  };
  if (questType === "fetch") {
    const quest = trackerData.quests.fetch[id];
    return {
      row: { ...base, displayName: getName("items", quest.itemId, locale) },
      villager: quest.villager,
    };
  }
  const displayName = displayQuestName(getName("quests", id, locale), questType, locale);
  if (questType === "heart") {
    const quest = trackerData.quests.heart[id];
    return {
      heartLevel: quest.heartLevel,
      row: { ...base, displayName },
      villager: quest.villager,
    };
  }
  return { row: { ...base, displayName } };
}

function questSources(questType: QuestType, questId: QuestId): Source[] {
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

/**
 * Fetch & heart quests name their Villager; so does any quest whose name repeats within its
 * section, with the reward recipe added when that alone doesn't tell the rows apart.
 */
function questSubtitle(
  row: QuestEntryRow,
  villager: undefined | VillagerId,
  questType: QuestType,
  duplicateNames: Set<string>,
  locale: LocaleCode,
): string | undefined {
  if (!villager) return undefined;
  const duplicated = duplicateNames.has(row.displayName);
  if (questType !== "fetch" && questType !== "heart" && !duplicated) return undefined;
  const villagerName = getName("villagers", villager, locale);
  const rewardRecipeName =
    questType === "fetch" ? fetchRewardRecipeName(row.id, locale) : undefined;
  return duplicated && rewardRecipeName
    ? m.quest_subtitle_with_recipe({ recipe: rewardRecipeName, villager: villagerName }, { locale })
    : villagerName;
}

function fetchRewardRecipeName(id: QuestId, locale: LocaleCode): string | undefined {
  const { rewardRecipeId } = trackerData.quests.fetch[id];
  return rewardRecipeId ? getName("recipes", rewardRecipeId, locale) : undefined;
}
