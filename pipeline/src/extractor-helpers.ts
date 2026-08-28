import type { QuestId, QuestType } from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "./parse-fiddle.js";

/**
 * The six TOML quest-group keys tracked in the UI.
 * Request-board and registry siblings are intentionally excluded.
 */
export const TRACKED_QUEST_GROUPS = [
  "story_quests",
  "heart_quests",
  "fetch_quests",
  "crown_quests",
  "stillwell_challenges",
  "tali_challenges",
] as const;

export type TrackedQuestGroup = (typeof TRACKED_QUEST_GROUPS)[number];

export const QUEST_TYPE_MAP: Record<TrackedQuestGroup, QuestType> = {
  crown_quests: "crown",
  fetch_quests: "fetch",
  heart_quests: "heart",
  stillwell_challenges: "mission",
  story_quests: "story",
  tali_challenges: "cooking",
};

export function buildQuestTypeIndex(fiddle: ParsedGameData): Map<QuestId, QuestType> {
  const entries = new Map<QuestId, QuestType>();

  forEachQuest(fiddle, TRACKED_QUEST_GROUPS, (nativeGroup, questId) => {
    const questType = QUEST_TYPE_MAP[nativeGroup as TrackedQuestGroup];
    const typedQuestId = questId as QuestId;
    const existing = entries.get(typedQuestId);
    if (existing && existing !== questType) {
      throw new Error(`Quest "${questId}" appears in both ${existing} and ${questType} groups`);
    }
    entries.set(typedQuestId, questType);
  });

  return new Map([...entries].sort(([left], [right]) => left.localeCompare(right)));
}

/**
 * Iterates every non-default, non-null, object item record in the full
 * `items[topCategory][subCategory][itemId]` hierarchy.
 *
 * Structural guards applied:
 * - absent `fiddle.items` root → no callbacks;
 * - `default` entries are skipped;
 * - null or non-object records are skipped.
 *
 * @param fiddle      Parsed game data.
 * @param callback    Receives `itemId`, the item record, `topCategory`, and `subCategory`.
 */
export function forEachItem(
  fiddle: ParsedGameData,
  callback: (
    itemId: string,
    item: Record<string, unknown>,
    topCategory: string,
    subCategory: string,
  ) => void,
): void {
  const items = fiddle.items as
    Record<string, Record<string, Record<string, Record<string, unknown>>>> | undefined;
  if (!items) return;

  for (const [topCat, subCategories] of Object.entries(items)) {
    if (typeof subCategories !== "object" || subCategories === null) continue;
    for (const [subCat, categoryItems] of Object.entries(subCategories)) {
      if (typeof categoryItems !== "object" || categoryItems === null) continue;
      for (const [itemId, item] of Object.entries(categoryItems)) {
        if (itemId === "default" || typeof item !== "object" || item === null) continue;
        callback(itemId, item, topCat, subCat);
      }
    }
  }
}

/**
 * Iterates every non-default, non-null, object quest record across the provided
 * quest-group keys.
 *
 * Structural guards applied:
 * - absent `fiddle.quests` root → no callbacks;
 * - missing or non-object group entries are skipped;
 * - `default` entries are skipped;
 * - null or non-object quest records are skipped.
 *
 * @param fiddle      Parsed game data.
 * @param questGroups Quest-group keys to iterate (e.g. a subset of TRACKED_QUEST_GROUPS).
 * @param callback    Receives `questType`, `questId`, and the quest record.
 */
export function forEachQuest(
  fiddle: ParsedGameData,
  questGroups: readonly string[],
  callback: (questType: string, questId: string, quest: Record<string, unknown>) => void,
): void {
  const quests = fiddle.quests as
    Record<string, Record<string, Record<string, unknown>>> | undefined;
  if (!quests) return;

  for (const questType of questGroups) {
    const questGroup = quests[questType];
    if (!questGroup || typeof questGroup !== "object") continue;

    for (const [questId, quest] of Object.entries(questGroup)) {
      if (questId === "default" || typeof quest !== "object" || quest === null) continue;
      callback(questType, questId, quest);
    }
  }
}
