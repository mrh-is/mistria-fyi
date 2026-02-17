import type { AnimalId, ItemId, QuestId, SpellId, TrackerData } from "$lib/types/tracker-data.js";

import type { FiddleData } from "../parse-fiddle.js";

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

export function extractQuestGates(fiddle: FiddleData): QuestGateIndex {
  const questGroups = fiddle.quests as
    | Record<string, Record<string, Record<string, unknown>>>
    | undefined;
  const cutscenes = fiddle.cutscenes as Record<string, Record<string, unknown>> | undefined;

  const questByCutscene = new Map<string, Set<QuestId>>();
  const questByConversation = new Map<string, Set<QuestId>>();
  if (questGroups) {
    for (const questGroup of Object.values(questGroups)) {
      if (!questGroup || typeof questGroup !== "object") continue;
      for (const [questId, quest] of Object.entries(questGroup)) {
        if (questId === "default" || typeof quest !== "object" || quest === null) continue;
        const questData = quest;
        const stages = toArray<Record<string, unknown>>(questData.stages);
        for (const stage of stages) {
          if (!stage || typeof stage !== "object") continue;
          const queries = toArray<Record<string, unknown>>(stage.queries);
          for (const query of queries) {
            if (!query || typeof query !== "object") continue;
            const cutsceneId = query.cutscene as string | undefined;
            if (cutsceneId) addQuestRef(questByCutscene, cutsceneId, questId as QuestId);
            const conversationId = query.npc_conversation as string | undefined;
            if (conversationId) {
              addQuestRef(questByConversation, conversationId, questId as QuestId);
            }
          }
        }
      }
    }
  }

  const progressionFlagToQuests = new Map<string, Set<QuestId>>();
  if (cutscenes) {
    for (const [cutsceneId, cutscene] of Object.entries(cutscenes)) {
      if (!cutscene || typeof cutscene !== "object") continue;
      const flags = collectStringValues(cutscene.progression_unlocks);
      if (flags.length === 0) continue;

      const questIds = collectQuestIdsForCutscene(
        cutsceneId,
        cutscene,
        questByCutscene,
        questByConversation,
      );
      if (questIds.size === 0) continue;
      for (const flag of flags) {
        const normalized = normalizeFlag(flag);
        if (!normalized) continue;
        for (const questId of questIds) {
          addQuestRef(progressionFlagToQuests, normalized, questId);
        }
      }
    }
  }

  if (questGroups) {
    for (const questGroup of Object.values(questGroups)) {
      if (!questGroup || typeof questGroup !== "object") continue;
      for (const [questId, quest] of Object.entries(questGroup)) {
        if (questId === "default" || typeof quest !== "object" || quest === null) continue;
        const questData = quest;
        const rewards = toArray<Record<string, unknown>>(questData.rewards);
        for (const reward of rewards) {
          if (!reward || typeof reward !== "object") continue;
          const unlock = reward.unlock as string | undefined;
          const normalized = normalizeFlag(unlock);
          if (!normalized) continue;
          addQuestRef(progressionFlagToQuests, normalized, questId as QuestId);
        }
      }
    }
  }

  const itemGates = collectItemQuestGates(fiddle, progressionFlagToQuests);
  const animalGates = collectAnimalQuestGates(fiddle, progressionFlagToQuests);
  const spellGates = collectSpellQuestGates(fiddle, questByCutscene, questByConversation);

  const flagsWithQuests = progressionFlagToQuests.size;
  const totalQuestLinks = [...progressionFlagToQuests.values()].reduce(
    (total, quests) => total + quests.size,
    0,
  );
  console.log(
    `  Quest gates: ${flagsWithQuests} progression flags → ${totalQuestLinks} quest links, ` +
      `${Object.keys(itemGates).length} items, ${Object.keys(animalGates).length} animals, ` +
      `${Object.keys(spellGates).length} spells`,
  );

  return {
    animalGates,
    itemGates,
    progressionFlagToQuests: mapToRecord(progressionFlagToQuests),
    spellGates,
  };
}

function addQuestRef(map: Map<string, Set<QuestId>>, key: string, questId: QuestId): void {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key)?.add(questId);
}

function addQuestSet(map: Map<string, Set<QuestId>>, key: string, quests: Set<QuestId>): void {
  if (!map.has(key)) map.set(key, new Set());
  const existing = map.get(key);
  if (!existing) return;
  quests.forEach((questId) => existing.add(questId));
}

function collectAnimalQuestGates(
  fiddle: FiddleData,
  progressionFlagToQuests: Map<string, Set<QuestId>>,
): Record<string, QuestId[]> {
  const ranching = fiddle.ranching as Record<string, unknown> | undefined;
  const animals = ranching?.animals as Record<string, Record<string, unknown>> | undefined;
  if (!animals) return {};

  const result = new Map<string, Set<QuestId>>();
  for (const [animalId, animal] of Object.entries(animals)) {
    if (animalId === "default" || !animal || typeof animal !== "object") continue;
    const core = animal.core as Record<string, unknown> | undefined;
    if (!core) continue;
    const flag =
      (core.progression_requirement as string | undefined) ??
      (core.progression_requirements as string | undefined);
    const normalized = normalizeFlag(flag);
    if (!normalized) continue;
    const quests = progressionFlagToQuests.get(normalized);
    if (!quests || quests.size === 0) continue;
    addQuestSet(result, animalId, quests);
  }

  return mapToRecord(result);
}

function collectItemQuestGates(
  fiddle: FiddleData,
  progressionFlagToQuests: Map<string, Set<QuestId>>,
): Record<string, QuestId[]> {
  const stores = fiddle.stores as Record<string, Record<string, unknown>> | undefined;
  if (!stores) return {};

  const result = new Map<string, Set<QuestId>>();

  for (const store of Object.values(stores)) {
    if (!store || typeof store !== "object") continue;
    const categories = toArray<Record<string, unknown>>(store.categories);
    for (const category of categories) {
      if (!category || typeof category !== "object") continue;
      const categoryData = category;
      collectStockQuestGates(result, categoryData.constant_stock, progressionFlagToQuests);
      collectStockQuestGates(result, categoryData.random_stock, progressionFlagToQuests);

      const seasonal = categoryData.seasonal as Record<string, unknown> | undefined;
      if (seasonal) {
        for (const items of Object.values(seasonal)) {
          collectStockQuestGates(result, items, progressionFlagToQuests);
        }
      }
    }
  }

  return mapToRecord(result);
}

function collectQuestIdsForCutscene(
  cutsceneId: string,
  cutscene: Record<string, unknown>,
  questByCutscene: Map<string, Set<QuestId>>,
  questByConversation: Map<string, Set<QuestId>>,
): Set<QuestId> {
  const questIds = new Set<QuestId>();
  const direct = questByCutscene.get(cutsceneId);
  if (direct) direct.forEach((questId) => questIds.add(questId));

  for (const suffix of ["_turn_in", "_turn_in_complete"]) {
    const conversationId = `${cutsceneId}${suffix}`;
    const fromConversation = questByConversation.get(conversationId);
    if (fromConversation) {
      fromConversation.forEach((questId) => questIds.add(questId));
    }
  }

  collectStringValues(cutscene.quest_to_progress).forEach((questId) =>
    questIds.add(questId as QuestId),
  );
  collectStringValues(cutscene.quest_to_start).forEach((questId) =>
    questIds.add(questId as QuestId),
  );
  collectQuestIdsFromCondition(cutscene.quest_is_completed).forEach((questId) =>
    questIds.add(questId),
  );

  return questIds;
}

function collectQuestIdsFromCondition(value: unknown): QuestId[] {
  if (typeof value === "string") {
    return normalizeFlag(value) ? [value as QuestId] : [];
  }
  if (value && typeof value === "object") {
    const quest = (value as Record<string, unknown>).quest;
    if (typeof quest === "string" && normalizeFlag(quest)) {
      return [quest as QuestId];
    }
  }
  return [];
}

function collectSpellQuestGates(
  fiddle: FiddleData,
  questByCutscene: Map<string, Set<QuestId>>,
  questByConversation: Map<string, Set<QuestId>>,
): Record<string, QuestId[]> {
  const cutscenes = fiddle.cutscenes as Record<string, Record<string, unknown>> | undefined;
  if (!cutscenes) return {};

  const result = new Map<string, Set<QuestId>>();
  for (const [cutsceneId, cutscene] of Object.entries(cutscenes)) {
    if (!cutscene || typeof cutscene !== "object") continue;
    const spellId = cutscene.spell_to_unlock as string | undefined;
    const normalizedSpell = normalizeFlag(spellId);
    if (!normalizedSpell) continue;
    const questIds = collectQuestIdsForCutscene(
      cutsceneId,
      cutscene,
      questByCutscene,
      questByConversation,
    );
    if (questIds.size === 0) continue;
    addQuestSet(result, normalizedSpell, questIds);
  }

  return mapToRecord(result);
}

function collectStockQuestGates(
  result: Map<string, Set<QuestId>>,
  stockData: unknown,
  progressionFlagToQuests: Map<string, Set<QuestId>>,
): void {
  const entries = toArray<Record<string, unknown> | string>(stockData);
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const entryData = entry;
    const itemId = entryData.item as string | undefined;
    if (!itemId) continue;

    const questGate = entryData.quest_is_completed as Record<string, unknown> | string | undefined;
    const questGateIds = collectQuestIdsFromCondition(questGate);
    if (questGateIds.length > 0) {
      addQuestSet(result, itemId, new Set(questGateIds));
    }

    const progression = entryData.progression as string | undefined;
    const normalized = normalizeFlag(progression);
    if (!normalized) continue;
    const quests = progressionFlagToQuests.get(normalized);
    if (!quests || quests.size === 0) continue;
    addQuestSet(result, itemId, quests);
  }
}

function collectStringValues(value: unknown): string[] {
  if (!value || value === "A>") return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }
  if (typeof value === "object") {
    return Object.values(value).flatMap((entry) => (typeof entry === "string" ? [entry] : []));
  }
  return [];
}

function mapToRecord(map: Map<string, Set<QuestId>>): Record<string, QuestId[]> {
  const result: Record<string, QuestId[]> = {};
  for (const [key, quests] of map.entries()) {
    result[key] = Array.from(quests);
  }
  return result;
}

function normalizeFlag(flag?: null | string): string | undefined {
  if (!flag || flag === "A>") return undefined;
  return flag;
}

/** Convert array or numbered-key object (from flat parser) to array. */
function toArray<T = unknown>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length > 0 && keys.every((k) => /^\d+$/.test(k))) {
      return keys.sort((a, b) => Number(a) - Number(b)).map((k) => obj[k] as T);
    }
  }
  return [];
}
