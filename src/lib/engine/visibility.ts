import { recordKeys, recordToArray } from "$lib/utils";

import type { CompletedState, QuestState } from "$lib/stores/user-state.svelte.js";
import type {
  NpcId,
  PerkId,
  QuestId,
  QuestType,
  SkillId,
  TrackerData,
} from "$lib/types/tracker-data.js";
import type { QuestVisibility, VisibilityCondition } from "$lib/types/visibility.js";

export interface UserProgressionState {
  knownNpcs: Set<NpcId>;
  marriedNpc: NpcId | null;
  minesFloor: number;
  npcLevels: Record<NpcId, number>;
  questVisibility: Record<QuestId, QuestVisibility>;
  renown: number;
  showSpoilers: boolean;
  skillLevels: Record<SkillId, number>;
  unlockedPerks: Set<PerkId>;
}

interface HeartChainEntry {
  heartLevel: number;
  npcId: NpcId;
  prerequisiteQuest?: QuestId;
  questId: QuestId;
}

export function deriveProgressionState(
  completed: CompletedState,
  trackerData: TrackerData,
  showSpoilers: boolean,
): UserProgressionState {
  const unlockedPerks = completed.unlockedPerks;
  const marriedNpc = completed.marriedNpc;

  // 1. Quest visibility, per-quest, from actual quest state + chain prerequisites.
  const questVisibility: Record<string, QuestVisibility> = {};
  for (const [questType, quests] of recordToArray(trackerData.quests)) {
    for (const questId of recordKeys(quests)) {
      const userState: QuestState = completed.questStates[questId] ?? "none";

      if (userState === "completed") {
        questVisibility[questId] = "completed";
      } else if (userState === "obtained") {
        questVisibility[questId] = "available";
      } else {
        questVisibility[questId] = evaluateQuestPrerequisites(
          questId,
          questType,
          completed,
          trackerData,
          questVisibility,
        );
      }
    }
  }

  // 2. Known NPCs: always-visible NPCs are always known; gated NPCs are known once their
  // visibility condition (typically a questCompleted gate) evaluates true.
  const npcIds = new Set<NpcId>(Object.keys(trackerData.npcs) as NpcId[]);

  const knownNpcs = new Set<NpcId>();
  if (showSpoilers) {
    for (const npcId of npcIds) knownNpcs.add(npcId);
  } else {
    const tempState: UserProgressionState = {
      knownNpcs: new Set(),
      marriedNpc,
      minesFloor: completed.mines.floor,
      npcLevels: completed.npcLevels,
      questVisibility,
      renown: completed.renown,
      showSpoilers: false,
      skillLevels: completed.skillLevels,
      unlockedPerks,
    };
    for (const npcId of npcIds) {
      const npcVis = trackerData.npcs[npcId].visibility;
      if (!npcVis || isVisible(npcVis, tempState)) {
        knownNpcs.add(npcId);
      }
    }
  }

  // 3. Effective NPC heart levels: stored level (manual + heartLevelChanges cascade), masked to 0
  // for gated NPCs the player doesn't yet know.
  const npcLevels: Record<string, number> = {};
  for (const npcId of npcIds) {
    const stored = computeStoredNpcLevel(npcId, completed, trackerData);
    npcLevels[npcId] = knownNpcs.has(npcId) ? stored : 0;
  }

  return {
    knownNpcs,
    marriedNpc,
    minesFloor: completed.mines.floor,
    npcLevels,
    questVisibility,
    renown: completed.renown,
    showSpoilers,
    skillLevels: completed.skillLevels,
    unlockedPerks,
  };
}

// ─── Core evaluator ─────────────────────────────────────────────────

export function isConditionInvertible(condition: VisibilityCondition): boolean {
  switch (condition.type) {
    case "always":
    case "heartLevel":
    case "married":
    case "minesLevel":
    case "perkUnlocked":
    case "questAvailable":
    case "questCompleted":
    case "renownLevel":
    case "skillLevel":
      return true;
    case "and":
    case "or":
      return condition.conditions.every(isConditionInvertible);
    case "npcKnown":
      return false;
  }
}

export function isEntityNameVisible(
  entityVisibility: VisibilityCondition,
  state: UserProgressionState,
): boolean {
  return isVisible(entityVisibility, state);
}

export function isVisible(condition: VisibilityCondition, state: UserProgressionState): boolean {
  if (state.showSpoilers) return true;

  switch (condition.type) {
    case "always":
      return true;
    case "and":
      return condition.conditions.every((c) => isVisible(c, state));
    case "heartLevel":
      return (state.npcLevels[condition.npcId] ?? 0) >= condition.level;
    case "married":
      return state.marriedNpc === condition.npcId;
    case "minesLevel":
      return state.minesFloor >= condition.floor;
    case "npcKnown":
      return state.knownNpcs.has(condition.npcId);
    case "or":
      return condition.conditions.some((c) => isVisible(c, state));
    case "perkUnlocked":
      return state.unlockedPerks.has(condition.perkId);
    case "questAvailable": {
      const vis = state.questVisibility[condition.questId];
      return vis === "available" || vis === "completed";
    }
    case "questCompleted":
      return state.questVisibility[condition.questId] === "completed";
    case "renownLevel":
      return state.renown >= condition.level;
    case "skillLevel":
      return (state.skillLevels[condition.skillId] ?? 0) >= condition.level;
  }
}

// ─── Invertibility & satisfaction ───────────────────────────────────

/**
 * Mutates `completed` to satisfy `condition`, per the invertible-primitive mapping in the spec
 * (spoiler-system-design.md Section 2). Callers should check `isConditionInvertible` first;
 * conditions containing a non-invertible `npcKnown` leaf are no-ops here.
 */
export function satisfyCondition(
  condition: VisibilityCondition,
  completed: CompletedState,
  trackerData: TrackerData,
): void {
  switch (condition.type) {
    case "always":
    case "npcKnown":
      return;
    case "and":
      for (const sub of condition.conditions) satisfyCondition(sub, completed, trackerData);
      return;
    case "heartLevel":
      completed.npcLevels[condition.npcId] = Math.max(
        completed.npcLevels[condition.npcId] ?? 0,
        condition.level,
      );
      return;
    case "married":
      completed.marriedNpc ??= condition.npcId;
      return;
    case "minesLevel":
      completed.mines.floor = Math.max(completed.mines.floor, condition.floor);
      return;
    case "or": {
      // The UI is expected to let the user pick a branch and call `satisfyCondition` with just
      // that branch. If handed the whole `or`, fall back to the first invertible branch.
      const branch = condition.conditions.find(isConditionInvertible) ?? condition.conditions.at(0);
      if (branch) satisfyCondition(branch, completed, trackerData);
      return;
    }
    case "perkUnlocked":
      completed.unlockedPerks.add(condition.perkId);
      return;
    case "questAvailable":
      markQuestPrerequisitesCompleted(condition.questId, completed, trackerData);
      return;
    case "questCompleted":
      markQuestCompleted(condition.questId, completed, trackerData);
      return;
    case "renownLevel":
      completed.renown = Math.max(completed.renown, condition.level);
      return;
    case "skillLevel":
      completed.skillLevels[condition.skillId] = Math.max(
        completed.skillLevels[condition.skillId] ?? 0,
        condition.level,
      );
      return;
  }
}

/** Combines a stored `npcLevels` entry with any `heartLevelChanges` cascade from completed quests. */
function computeStoredNpcLevel(
  npcId: NpcId,
  completed: CompletedState,
  trackerData: TrackerData,
): number {
  let level = completed.npcLevels[npcId] ?? 0;
  for (const [questId, state] of recordToArray(completed.questStates)) {
    if (state !== "completed") continue;
    if (!(questId in trackerData.quests.story)) continue;
    const quest = trackerData.quests.story[questId];
    if (quest.heartLevelChanges === undefined) continue;
    for (const change of quest.heartLevelChanges) {
      if (change.npcId === npcId) level = Math.max(level, change.level);
    }
  }
  return level;
}

function evaluateOrderedChain(
  order: QuestId[],
  questId: QuestId,
  completed: CompletedState,
  trackerData: TrackerData,
  baseCondition: VisibilityCondition,
): QuestVisibility {
  const index = order.indexOf(questId);
  if (index === -1) return "unavailable";
  if (!isBaseConditionMet(baseCondition, completed, trackerData)) return "unavailable";
  if (index === 0) return "available";
  const prevQuestId = order[index - 1];
  return completed.questStates[prevQuestId] === "completed" ? "available" : "unavailable";
}

function evaluateQuestPrerequisites(
  questId: QuestId,
  questType: QuestType,
  completed: CompletedState,
  trackerData: TrackerData,
  questVisibilitySoFar: Record<string, QuestVisibility>,
): QuestVisibility {
  const chains = trackerData.questChains;
  const visibility = trackerData.categoryVisibility[questType];
  if (!visibility) throw new Error(`Unknown visibility for quest type ${questType}`);

  switch (questType) {
    case "cooking":
      return evaluateOrderedChain(chains.tali, questId, completed, trackerData, visibility);
    case "crown":
      return evaluateOrderedChain(chains.crown, questId, completed, trackerData, visibility);
    case "fetch": {
      const condition = lookup(chains.fetch, questId);
      if (!condition) return "unavailable";
      const tempState: UserProgressionState = {
        knownNpcs: new Set(),
        marriedNpc: completed.marriedNpc,
        minesFloor: completed.mines.floor,
        npcLevels: completed.npcLevels,
        questVisibility: questVisibilitySoFar,
        renown: completed.renown,
        showSpoilers: false,
        skillLevels: completed.skillLevels,
        unlockedPerks: completed.unlockedPerks,
      };
      return isVisible(condition, tempState) ? "available" : "unavailable";
    }
    case "heart": {
      const entry = findHeartChainEntry(chains.heart, questId);
      if (!entry) return "unavailable";
      const heartLevelMet = (completed.npcLevels[entry.npcId] ?? 0) >= entry.heartLevel;
      const prereqMet =
        !entry.prerequisiteQuest || completed.questStates[entry.prerequisiteQuest] === "completed";
      return heartLevelMet && prereqMet ? "available" : "unavailable";
    }
    case "mission":
      return evaluateOrderedChain(chains.stillwell, questId, completed, trackerData, visibility);
    case "story": {
      const prerequisites = lookup(chains.story, questId)?.prerequisites ?? [];
      const allMet = prerequisites.every(
        (prereqId) => completed.questStates[prereqId] === "completed",
      );
      return allMet ? "available" : "unavailable";
    }
    default:
      return "unavailable";
  }
}

function findHeartChainEntry(
  heart: TrackerData["questChains"]["heart"],
  questId: QuestId,
): HeartChainEntry | undefined {
  for (const [npcId, entries] of Object.entries(heart)) {
    const entry = entries.find((e) => e.questId === questId);
    if (entry) return { ...entry, npcId: npcId as NpcId };
  }
  return undefined;
}

// ─── Progression state derivation ───────────────────────────────────

function findQuestType(questId: QuestId, trackerData: TrackerData): string | undefined {
  for (const [questType, quests] of Object.entries(trackerData.quests)) {
    if (questId in quests) return questType;
  }
  return undefined;
}

function isBaseConditionMet(
  condition: VisibilityCondition,
  completed: CompletedState,
  trackerData: TrackerData,
): boolean {
  switch (condition.type) {
    case "always":
      return true;
    case "and":
      return condition.conditions.every((c) => isBaseConditionMet(c, completed, trackerData));
    case "heartLevel":
      return (completed.npcLevels[condition.npcId] ?? 0) >= condition.level;
    case "married":
      return completed.marriedNpc === condition.npcId;
    case "minesLevel":
      return completed.mines.floor >= condition.floor;
    case "npcKnown": {
      const npcVis = trackerData.npcs[condition.npcId].visibility;
      if (!npcVis || npcVis.type === "always") return true;
      return isBaseConditionMet(npcVis, completed, trackerData);
    }
    case "or":
      return condition.conditions.some((c) => isBaseConditionMet(c, completed, trackerData));
    case "perkUnlocked":
      return completed.unlockedPerks.has(condition.perkId);
    case "questAvailable":
      return (completed.questStates[condition.questId] ?? "none") !== "none";
    case "questCompleted":
      return completed.questStates[condition.questId] === "completed";
    case "renownLevel":
      return completed.renown >= condition.level;
    case "skillLevel":
      return (completed.skillLevels[condition.skillId] ?? 0) >= condition.level;
  }
}

/**
 * Looks up `key` in `record` without TypeScript's optimistic (and here, incorrect) assumption
 * that every key of a `Record<K, V>` is present — several `TrackerData` maps are only populated
 * for a subset of the IDs this module iterates over (e.g. not every quest has a fetch/story chain
 * entry, not every NPC has an explicit `npcVisibility` gate).
 */
function lookup<V>(record: Record<string, V>, key: string): undefined | V {
  return (record as Record<string, undefined | V>)[key];
}

function markOrderedPredecessorsCompleted(
  order: QuestId[],
  questId: QuestId,
  completed: CompletedState,
  trackerData: TrackerData,
): void {
  const index = order.indexOf(questId);
  if (index <= 0) return;
  for (let i = 0; i < index; i++) markQuestCompleted(order[i], completed, trackerData);
}

/** Marks `questId` completed, first recursively completing everything it's chained behind. */
function markQuestCompleted(
  questId: QuestId,
  completed: CompletedState,
  trackerData: TrackerData,
): void {
  if (completed.questStates[questId] === "completed") return;
  markQuestPrerequisitesCompleted(questId, completed, trackerData);
  completed.questStates[questId] = "completed";
}

/** Marks every quest `questId` is chained behind as completed, without touching `questId` itself. */
function markQuestPrerequisitesCompleted(
  questId: QuestId,
  completed: CompletedState,
  trackerData: TrackerData,
): void {
  const questType = findQuestType(questId, trackerData);
  if (!questType) return;

  const chains = trackerData.questChains;
  switch (questType) {
    case "crown_quests":
      markOrderedPredecessorsCompleted(chains.crown, questId, completed, trackerData);
      return;
    case "fetch_quests": {
      const condition = lookup(chains.fetch, questId);
      if (condition) satisfyCondition(condition, completed, trackerData);
      return;
    }
    case "heart_quests": {
      const entry = findHeartChainEntry(chains.heart, questId);
      if (entry) {
        completed.npcLevels[entry.npcId] = Math.max(
          completed.npcLevels[entry.npcId] ?? 0,
          entry.heartLevel,
        );
        if (entry.prerequisiteQuest) {
          markQuestCompleted(entry.prerequisiteQuest, completed, trackerData);
        }
      }
      return;
    }
    case "stillwell_challenges":
      markOrderedPredecessorsCompleted(chains.stillwell, questId, completed, trackerData);
      return;
    case "story_quests": {
      const prerequisites = lookup(chains.story, questId)?.prerequisites ?? [];
      for (const prereqId of prerequisites) markQuestCompleted(prereqId, completed, trackerData);
      return;
    }
    case "tali_challenges":
      markOrderedPredecessorsCompleted(chains.tali, questId, completed, trackerData);
      return;
  }
}
