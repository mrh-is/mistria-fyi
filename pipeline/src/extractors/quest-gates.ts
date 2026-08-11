import type { AnimalId, ItemId, QuestId, SpellId, TrackerData } from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle.js";

/**
 * Indexes quests that directly grant finished items. Recipe and crafting-scroll rewards have no
 * direct item field, so they are excluded. Reward quests deduplicate per item, unresolved target
 * attachments skip silently, and an item gate may exist without matching item metadata.
 *
 * Animal, spell, and progression requirement inference remains deferred as intentionally empty maps.
 */
export interface QuestGateIndex {
  animalGates: Record<AnimalId, QuestId[]>;
  itemGates: Record<ItemId, QuestId[]>;
  progressionFlagToQuests: Record<string, QuestId[]>;
  spellGates: Record<SpellId, QuestId[]>;
}

export function applyAnimalQuestGates(
  animals: TrackerData["animals"],
  questGates: Record<AnimalId, QuestId[]>,
): void {
  for (const [animalId, quests] of Object.entries(questGates)) {
    const animal = animals[animalId as keyof typeof animals];
    if (!animal) continue;
    animal.questGate = quests;
  }
}

export function applyItemQuestGates(
  items: TrackerData["items"],
  questGates: Record<ItemId, QuestId[]>,
): void {
  for (const [itemId, quests] of Object.entries(questGates)) {
    const typedId = itemId as ItemId;
    const item = items[typedId];
    if (!item) continue;
    items[typedId] = { ...item, questGate: quests };
  }
}

export function applySpellQuestGates(
  mines: TrackerData["mines"],
  questGates: Record<SpellId, QuestId[]>,
): void {
  for (const [spellId, quests] of Object.entries(questGates)) {
    const typedId = spellId as SpellId;
    const spell = mines.spells[typedId];
    if (!spell) continue;
    mines.spells[typedId] = { ...spell, questGate: quests };
  }
}

const TRACKED_QUEST_GROUP_KEYS = [
  "story_quests",
  "heart_quests",
  "fetch_quests",
  "crown_quests",
  "stillwell_challenges",
  "tali_challenges",
];

export function extractQuestGates(fiddle: ParsedGameData): QuestGateIndex {
  const questGroups = fiddle.quests as
    | Record<string, Record<string, Record<string, unknown>>>
    | undefined;

  const directRewardQuestsByItemId: Record<string, Set<QuestId>> = {};

  if (questGroups) {
    // These allowlisted keys are TOML group/file names, excluding request-board and registry siblings.
    for (const questType of TRACKED_QUEST_GROUP_KEYS) {
      const questGroup = questGroups[questType];
      if (!questGroup || typeof questGroup !== "object") continue;

      for (const [questId, quest] of Object.entries(questGroup)) {
        if (questId === "default" || typeof quest !== "object" || quest === null) continue;

        const rewards = Array.isArray(quest.rewards) ? quest.rewards : [];
        for (const reward of rewards) {
          if (typeof reward !== "object" || reward === null) continue;
          const itemId = (reward as Record<string, unknown>).item as string | undefined;
          if (!itemId) continue;

          if (!directRewardQuestsByItemId[itemId]) {
            directRewardQuestsByItemId[itemId] = new Set();
          }
          directRewardQuestsByItemId[itemId].add(questId as QuestId);
        }
      }
    }
  }

  const directItemRewardIndex: Record<string, QuestId[]> = {};
  for (const [itemId, quests] of Object.entries(directRewardQuestsByItemId)) {
    directItemRewardIndex[itemId] = Array.from(quests);
  }

  const directCount = Object.keys(directItemRewardIndex).length;
  console.log(`  Quest gates: ${directCount} direct item gates preserved`);
  console.log(`    Deferred: animal gates (requires requirement→quest inference)`);
  console.log(`    Deferred: spell gates (requires cutscene→quest inference)`);
  console.log(`    Deferred: store item gates (requires requirement→quest inference)`);

  return {
    animalGates: {} as Record<AnimalId, QuestId[]>,
    itemGates: directItemRewardIndex as Record<ItemId, QuestId[]>,
    progressionFlagToQuests: {},
    spellGates: {} as Record<SpellId, QuestId[]>,
  };
}
