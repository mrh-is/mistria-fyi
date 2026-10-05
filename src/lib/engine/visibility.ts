import { getMarriedVillager, normalizeRelationships } from "#lib/engine/relationships.js";
import { recordEntries, recordKeys } from "#lib/utils.js";

import type { CompletedState, QuestState } from "#lib/stores/user-state.svelte.js";
import type {
  PerkId,
  QuestId,
  QuestType,
  Season,
  SkillId,
  TrackerData,
  VillagerId,
} from "#lib/types/tracker-data.js";
import type { QuestVisibility, VisibilityCondition } from "#lib/types/visibility.js";

const SEASON_ORD: Record<Season, number> = { fall: 2, spring: 0, summer: 1, winter: 3 };

export interface UserProgressionState {
  hasUpperFloor: boolean;
  isDating: boolean;
  knownVillagers: Set<VillagerId>;
  marriedVillager: null | VillagerId;
  minesFloor: number;
  questVisibility: Record<QuestId, QuestVisibility>;
  reachedSeason: Season;
  renown: number;
  showSpoilers: boolean;
  skillLevels: Record<SkillId, number>;
  unlockedPerks: Set<PerkId>;
  villagerLevels: Record<VillagerId, number>;
}

export function deriveProgressionState(
  completed: CompletedState,
  trackerData: TrackerData,
  showSpoilers: boolean,
): UserProgressionState {
  const unlockedPerks = completed.unlockedPerks;
  const marriedVillager = getMarriedVillager(completed.villagerRelationships);

  // 1. Quest visibility, per-quest, from actual quest state + chain prerequisites.
  const questVisibility = deriveQuestVisibility(completed, trackerData);

  // 2. Known villagers: always-visible villagers are always known; gated villagers are known once their
  // visibility condition (typically a questCompleted gate) evaluates true.
  const villagerIds = new Set<VillagerId>(Object.keys(trackerData.villagers) as VillagerId[]);

  const knownVillagers = new Set<VillagerId>();
  if (showSpoilers) {
    for (const villagerId of villagerIds) knownVillagers.add(villagerId);
  } else {
    const tempState: UserProgressionState = {
      hasUpperFloor: completed.hasUpperFloor,
      isDating: Object.values(completed.villagerRelationships).some(
        (r) => r === "romantic" || r === "proposed" || r === "married",
      ),
      knownVillagers: new Set(),
      marriedVillager,
      minesFloor: completed.mines.floor,
      questVisibility,
      reachedSeason: completed.reachedSeason,
      renown: completed.renown,
      showSpoilers: false,
      skillLevels: completed.skillLevels,
      unlockedPerks,
      villagerLevels: completed.villagerLevels,
    };
    for (const villagerId of villagerIds) {
      const villagerVis = trackerData.villagers[villagerId].visibility;
      if (!villagerVis || isVisible(villagerVis, tempState)) {
        knownVillagers.add(villagerId);
      }
    }
  }

  // 3. Effective villager heart levels: stored level (manual + heartLevelChanges cascade), masked to 0
  // for gated villagers the player doesn't yet know.
  const villagerLevels: Record<string, number> = {};
  for (const villagerId of villagerIds) {
    const stored = computeStoredVillagerLevel(villagerId, completed, trackerData);
    villagerLevels[villagerId] = knownVillagers.has(villagerId) ? stored : 0;
  }

  return {
    hasUpperFloor: completed.hasUpperFloor,
    isDating: Object.values(completed.villagerRelationships).some(
      (r) => r === "romantic" || r === "proposed" || r === "married",
    ),
    knownVillagers,
    marriedVillager,
    minesFloor: completed.mines.floor,
    questVisibility,
    reachedSeason: completed.reachedSeason,
    renown: completed.renown,
    showSpoilers,
    skillLevels: completed.skillLevels,
    unlockedPerks,
    villagerLevels,
  };
}

// ─── Core evaluator ─────────────────────────────────────────────────

export function isConditionInvertible(condition: VisibilityCondition): boolean {
  switch (condition.type) {
    case "always":
    case "hasUpperFloor":
    case "heartLevel":
    case "married":
    case "minesLevel":
    case "perkUnlocked":
    case "questAvailable":
    case "questCompleted":
    case "reachedSeason":
    case "renownLevel":
    case "skillLevel":
      return true;
    case "and":
    case "or":
      return condition.conditions.every(isConditionInvertible);
    case "isDating":
    case "villagerKnown":
      return false;
  }
}

export function isEntityNameVisible(
  entityVisibility: undefined | VisibilityCondition,
  state: UserProgressionState,
): boolean {
  return isVisible(entityVisibility, state);
}

export function isVisible(
  condition: undefined | VisibilityCondition,
  state: UserProgressionState,
): boolean {
  // Default visibility is always
  if (!condition) return true;

  if (state.showSpoilers) return true;

  switch (condition.type) {
    case "always":
      return true;
    case "and":
      return condition.conditions.every((c) => isVisible(c, state));
    case "hasUpperFloor":
      return state.hasUpperFloor;
    case "heartLevel":
      return (state.villagerLevels[condition.villagerId] ?? 0) >= condition.level;
    case "isDating":
      return state.isDating;
    case "married":
      return state.marriedVillager === condition.villagerId;
    case "minesLevel":
      return state.minesFloor >= condition.floor;
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
    case "reachedSeason":
      return SEASON_ORD[state.reachedSeason] >= SEASON_ORD[condition.season];
    case "renownLevel":
      return state.renown >= condition.level;
    case "skillLevel":
      return (state.skillLevels[condition.skillId] ?? 0) >= condition.level;
    case "villagerKnown":
      return state.knownVillagers.has(condition.villagerId);
  }
}

// ─── Invertibility & satisfaction ───────────────────────────────────

/**
 * Mutates `completed` to satisfy `condition`, per the invertible-primitive mapping in the spec
 * (spoiler-system-design.md Section 2). Callers should check `isConditionInvertible` first;
 * conditions containing a non-invertible `villagerKnown` leaf are no-ops here.
 */
export function satisfyCondition(
  condition: VisibilityCondition,
  completed: CompletedState,
  trackerData: TrackerData,
): void {
  switch (condition.type) {
    case "always":
    case "isDating":
    case "villagerKnown":
      return;
    case "and":
      for (const sub of condition.conditions) satisfyCondition(sub, completed, trackerData);
      return;
    case "hasUpperFloor":
      completed.hasUpperFloor = true;
      return;
    case "heartLevel":
      completed.villagerLevels[condition.villagerId] = Math.max(
        completed.villagerLevels[condition.villagerId] ?? 0,
        condition.level,
      );
      return;
    case "married":
      if (!getMarriedVillager(completed.villagerRelationships)) {
        completed.villagerRelationships[condition.villagerId] = "married";
        normalizeRelationships(completed.villagerRelationships);
      }
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
    case "reachedSeason":
      if (SEASON_ORD[condition.season] > SEASON_ORD[completed.reachedSeason]) {
        completed.reachedSeason = condition.season;
      }
      return;
    case "renownLevel":
      completed.renown = Math.max(completed.renown, condition.level);
      return;
    case "skillLevel":
      completed.skillLevels[condition.skillId] = Math.max(
        completed.skillLevels[condition.skillId] ?? 0,
        condition.level,
      );
  }
}

/** Combines a stored `villagerLevels` entry with any `heartLevelChanges` cascade from completed quests. */
function computeStoredVillagerLevel(
  villagerId: VillagerId,
  completed: CompletedState,
  trackerData: TrackerData,
): number {
  let level = completed.villagerLevels[villagerId] ?? 0;
  for (const [questId, state] of recordEntries(completed.questStates)) {
    if (state !== "completed") continue;
    if (!(questId in trackerData.quests.story)) continue;
    const quest = trackerData.quests.story[questId];
    if (quest.heartLevelChanges === undefined) continue;
    for (const change of quest.heartLevelChanges) {
      if (change.villagerId === villagerId) level = Math.max(level, change.level);
    }
  }
  return level;
}

/**
 * Quest visibility is independent of quest key order: quests the player has obtained or completed
 * are fixed by their state, and the rest start "unavailable" and are re-evaluated until nothing
 * changes. Every condition is monotone, so this reaches the least fixpoint; quests in a
 * prerequisite cycle stay "unavailable".
 */
function deriveQuestVisibility(
  completed: CompletedState,
  trackerData: TrackerData,
): Record<QuestId, QuestVisibility> {
  const questVisibility: Record<QuestId, QuestVisibility> = {};
  const pending: [QuestId, QuestType][] = [];
  for (const [questType, quests] of recordEntries(trackerData.quests)) {
    for (const questId of recordKeys(quests)) {
      const userState: QuestState = completed.questStates[questId] ?? "none";
      if (userState === "completed") {
        questVisibility[questId] = "completed";
      } else if (userState === "obtained") {
        questVisibility[questId] = "available";
      } else {
        questVisibility[questId] = "unavailable";
        pending.push([questId, questType]);
      }
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const [questId, questType] of pending) {
      if (questVisibility[questId] === "available") continue;
      const visibility = evaluateQuestPrerequisites(
        questId,
        questType,
        completed,
        trackerData,
        questVisibility,
      );
      if (visibility !== questVisibility[questId]) {
        questVisibility[questId] = visibility;
        changed = true;
      }
    }
  }
  return questVisibility;
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
  questVisibility: Record<QuestId, QuestVisibility>,
): QuestVisibility {
  const order = trackerData.questOrder[questType];
  if (order) {
    const categoryVis = trackerData.categoryVisibility[questType] ?? { type: "always" as const };
    return evaluateOrderedChain(order, questId, completed, trackerData, categoryVis);
  }

  const quest = trackerData.quests[questType][questId];
  if (!quest.visibility) return "available";

  const tempState: UserProgressionState = {
    hasUpperFloor: completed.hasUpperFloor,
    isDating: Object.values(completed.villagerRelationships).some(
      (r) => r === "romantic" || r === "proposed" || r === "married",
    ),
    knownVillagers: new Set(),
    marriedVillager: getMarriedVillager(completed.villagerRelationships),
    minesFloor: completed.mines.floor,
    questVisibility,
    reachedSeason: completed.reachedSeason,
    renown: completed.renown,
    showSpoilers: false,
    skillLevels: completed.skillLevels,
    unlockedPerks: completed.unlockedPerks,
    villagerLevels: completed.villagerLevels,
  };
  return isVisible(quest.visibility, tempState) ? "available" : "unavailable";
}

// ─── Progression state derivation ───────────────────────────────────

function findQuestType(questId: QuestId, trackerData: TrackerData): QuestType | undefined {
  for (const [questType, quests] of recordEntries(trackerData.quests)) {
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
    case "hasUpperFloor":
      return completed.hasUpperFloor;
    case "heartLevel":
      return (completed.villagerLevels[condition.villagerId] ?? 0) >= condition.level;
    case "isDating":
      return Object.values(completed.villagerRelationships).some(
        (r) => r === "romantic" || r === "proposed" || r === "married",
      );
    case "married":
      return getMarriedVillager(completed.villagerRelationships) === condition.villagerId;
    case "minesLevel":
      return completed.mines.floor >= condition.floor;
    case "or":
      return condition.conditions.some((c) => isBaseConditionMet(c, completed, trackerData));
    case "perkUnlocked":
      return completed.unlockedPerks.has(condition.perkId);
    case "questAvailable":
      return (completed.questStates[condition.questId] ?? "none") !== "none";
    case "questCompleted":
      return completed.questStates[condition.questId] === "completed";
    case "reachedSeason":
      return SEASON_ORD[completed.reachedSeason] >= SEASON_ORD[condition.season];
    case "renownLevel":
      return completed.renown >= condition.level;
    case "skillLevel":
      return (completed.skillLevels[condition.skillId] ?? 0) >= condition.level;
    case "villagerKnown": {
      const villagerVis = trackerData.villagers[condition.villagerId].visibility;
      if (!villagerVis || villagerVis.type === "always") return true;
      return isBaseConditionMet(villagerVis, completed, trackerData);
    }
  }
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

function markQuestPrerequisitesCompleted(
  questId: QuestId,
  completed: CompletedState,
  trackerData: TrackerData,
): void {
  const questType = findQuestType(questId, trackerData);
  if (!questType) return;

  const order = trackerData.questOrder[questType];
  if (order) {
    markOrderedPredecessorsCompleted(order, questId, completed, trackerData);
    return;
  }

  const quest = trackerData.quests[questType][questId];
  if (quest.visibility) {
    satisfyCondition(quest.visibility, completed, trackerData);
  }
}
