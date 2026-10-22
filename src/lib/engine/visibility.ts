import { seasonOrdinal } from "#lib/engine/domain-primitives.js";
import { applyEngagementCascade, getSpouseId, isRomantic } from "#lib/engine/relationships.js";
import { recordEntries, recordKeys } from "#lib/utils/record.js";

import type {
  PerkId,
  QuestId,
  QuestType,
  Season,
  SkillId,
  TrackerData,
  VillagerId,
} from "#lib/types/tracker-data.js";
import type { ProgressState, QuestState } from "#lib/types/user-progress.js";
import type { QuestVisibility, VisibilityCondition } from "#lib/types/visibility.js";
import type { DeepReadonly } from "#lib/utils/deep-readonly.js";

export interface UserProgressionState {
  hasUpperFloor: boolean;
  heartLevels: Partial<Record<VillagerId, number>>;
  isDating: boolean;
  knownVillagers: Set<VillagerId>;
  marriedVillager: null | VillagerId;
  mineFloor: number;
  questVisibility: Record<QuestId, QuestVisibility>;
  reachedSeason: Season;
  renown: number;
  showSpoilers: boolean;
  skillLevels: Readonly<Partial<Record<SkillId, number>>>;
  unlockedPerks: ReadonlySet<PerkId>;
}

export function deriveProgressionState(
  completed: DeepReadonly<ProgressState>,
  trackerData: TrackerData,
  showSpoilers: boolean,
): UserProgressionState {
  const recorded = recordedProgressContext(completed, trackerData);
  const questVisibility = deriveQuestVisibility(completed, trackerData, recorded);
  // Discovery intentionally uses derived quest statuses but recorded heart levels. Unknown
  // villagers cannot recursively disclose one another during this pass.
  const discovery = questProgressContext(recorded, questVisibility);
  const villagerIds = recordKeys(trackerData.villagers);
  const knownVillagers = new Set<VillagerId>();
  for (const villagerId of villagerIds) {
    if (
      showSpoilers ||
      evaluateCondition(trackerData.villagers[villagerId].visibility, discovery)
    ) {
      knownVillagers.add(villagerId);
    }
  }

  const storedLevels = computeStoredHeartLevels(completed, trackerData);
  const heartLevels: Partial<Record<VillagerId, number>> = {};
  for (const villagerId of villagerIds) {
    heartLevels[villagerId] = knownVillagers.has(villagerId) ? (storedLevels[villagerId] ?? 0) : 0;
  }

  return {
    hasUpperFloor: recorded.hasUpperFloor,
    heartLevels,
    isDating: recorded.isDating,
    knownVillagers,
    marriedVillager: recorded.marriedVillager,
    mineFloor: recorded.mineFloor,
    questVisibility,
    reachedSeason: recorded.reachedSeason,
    renown: recorded.renown,
    showSpoilers,
    skillLevels: recorded.skillLevels,
    unlockedPerks: recorded.unlockedPerks,
  };
}

// ─── Core evaluator ─────────────────────────────────────────────────

export function canPlanConditionMutations(condition: VisibilityCondition): boolean {
  switch (condition.type) {
    case "always":
    case "hasUpperFloor":
    case "heartLevel":
    case "married":
    case "mineFloor":
    case "perkUnlocked":
    case "questAvailable":
    case "questCompleted":
    case "reachedSeason":
    case "renownLevel":
    case "skillLevel":
      return true;
    case "and":
    case "or":
      return condition.conditions.every(canPlanConditionMutations);
    case "isDating":
    case "villagerKnown":
      return false;
  }
}

type ConditionContext = Omit<
  UserProgressionState,
  "knownVillagers" | "questVisibility" | "showSpoilers"
> & {
  isVillagerKnown: (villagerId: VillagerId) => boolean;
  questStatus: (questId: QuestId) => QuestVisibility | undefined;
};

export function isConditionVisible(
  condition: undefined | VisibilityCondition,
  state: UserProgressionState,
): boolean {
  return (
    state.showSpoilers ||
    evaluateCondition(condition, {
      ...state,
      isVillagerKnown: (villagerId) => state.knownVillagers.has(villagerId),
      questStatus: (questId) => state.questVisibility[questId],
    })
  );
}

function evaluateCondition(
  condition: undefined | VisibilityCondition,
  state: ConditionContext,
): boolean {
  if (!condition) return true;
  switch (condition.type) {
    case "always":
      return true;
    case "and":
      return condition.conditions.every((c) => evaluateCondition(c, state));
    case "hasUpperFloor":
      return state.hasUpperFloor;
    case "heartLevel":
      return (state.heartLevels[condition.villagerId] ?? 0) >= condition.level;
    case "isDating":
      return state.isDating;
    case "married":
      return state.marriedVillager === condition.villagerId;
    case "mineFloor":
      return state.mineFloor >= condition.floor;
    case "or":
      return condition.conditions.some((c) => evaluateCondition(c, state));
    case "perkUnlocked":
      return state.unlockedPerks.has(condition.perkId);
    case "questAvailable": {
      const vis = state.questStatus(condition.questId);
      return vis === "available" || vis === "completed";
    }
    case "questCompleted":
      return state.questStatus(condition.questId) === "completed";
    case "reachedSeason":
      return seasonOrdinal(state.reachedSeason) >= seasonOrdinal(condition.season);
    case "renownLevel":
      return state.renown >= condition.level;
    case "skillLevel":
      return (state.skillLevels[condition.skillId] ?? 0) >= condition.level;
    case "villagerKnown":
      return state.isVillagerKnown(condition.villagerId);
  }
}

// ─── Invertibility & satisfaction ───────────────────────────────────

type ConditionDraft = Pick<
  ProgressState,
  | "breakUpsDisabled"
  | "hasUpperFloor"
  | "heartLevels"
  | "mineFloor"
  | "questStates"
  | "reachedSeason"
  | "renown"
  | "skillLevels"
  | "unlockedPerks"
  | "villagerRelationships"
>;

export type ConditionMutation =
  | { type: "hasUpperFloor" }
  | { type: "heartLevel"; level: number; villagerId: VillagerId }
  | { type: "married"; villagerId: VillagerId }
  | { type: "mineFloor"; floor: number }
  | { type: "perkUnlocked"; perkId: PerkId }
  | { type: "questCompleted"; questId: QuestId }
  | { type: "reachedSeason"; season: Season }
  | { type: "renownLevel"; level: number }
  | { type: "skillLevel"; level: number; skillId: SkillId };

/** Plans intended progress changes without mutating the caller's state. Apply via store setters. */
export function planConditionMutations(
  condition: VisibilityCondition,
  completed: DeepReadonly<ProgressState>,
  trackerData: TrackerData,
): ConditionMutation[] {
  // Only these fields can be touched by prerequisite traversal; all other progress is read-only.
  const draft = {
    ...completed,
    heartLevels: { ...completed.heartLevels },
    questStates: { ...completed.questStates },
    skillLevels: { ...completed.skillLevels },
    unlockedPerks: new Set(completed.unlockedPerks),
    villagerRelationships: { ...completed.villagerRelationships },
  };
  planConditionMutationsInDraft(condition, draft, trackerData);
  const mutations: ConditionMutation[] = [];
  if (draft.hasUpperFloor !== completed.hasUpperFloor) mutations.push({ type: "hasUpperFloor" });
  if (draft.mineFloor !== completed.mineFloor) {
    mutations.push({ type: "mineFloor", floor: draft.mineFloor });
  }
  if (draft.renown !== completed.renown) {
    mutations.push({ type: "renownLevel", level: draft.renown });
  }
  if (draft.reachedSeason !== completed.reachedSeason) {
    mutations.push({ type: "reachedSeason", season: draft.reachedSeason });
  }
  for (const [villagerId, level] of recordEntries(draft.heartLevels)) {
    if (level !== completed.heartLevels[villagerId]) {
      mutations.push({ type: "heartLevel", level, villagerId });
    }
  }
  for (const [skillId, level] of recordEntries(draft.skillLevels)) {
    if (level !== completed.skillLevels[skillId]) {
      mutations.push({ type: "skillLevel", level, skillId });
    }
  }
  for (const perkId of draft.unlockedPerks) {
    if (!completed.unlockedPerks.has(perkId)) mutations.push({ type: "perkUnlocked", perkId });
  }
  for (const [questId, value] of recordEntries(draft.questStates)) {
    if (value === "completed" && completed.questStates[questId] !== value) {
      mutations.push({ type: "questCompleted", questId });
    }
  }
  const spouse = getSpouseId(draft.villagerRelationships);
  if (spouse !== null && spouse !== getSpouseId(completed.villagerRelationships)) {
    mutations.push({ type: "married", villagerId: spouse });
  }
  return mutations;
}

/** Mutates a private draft to preserve ordered prerequisite & OR-branch planning. */
function planConditionMutationsInDraft(
  condition: VisibilityCondition,
  completed: ConditionDraft,
  trackerData: TrackerData,
): void {
  switch (condition.type) {
    case "always":
    case "isDating":
    case "villagerKnown":
      return;
    case "and":
      for (const sub of condition.conditions) {
        planConditionMutationsInDraft(sub, completed, trackerData);
      }
      return;
    case "hasUpperFloor":
      completed.hasUpperFloor = true;
      return;
    case "heartLevel":
      completed.heartLevels[condition.villagerId] = Math.max(
        completed.heartLevels[condition.villagerId] ?? 0,
        condition.level,
      );
      return;
    case "married":
      if (!getSpouseId(completed.villagerRelationships)) {
        completed.villagerRelationships[condition.villagerId] = "married";
        applyEngagementCascade(completed.villagerRelationships, completed.breakUpsDisabled);
      }
      return;
    case "mineFloor":
      completed.mineFloor = Math.max(completed.mineFloor, condition.floor);
      return;
    case "or": {
      // The UI is expected to let the user pick a branch and call `planConditionMutations` with just
      // that branch. If handed the whole `or`, fall back to the first invertible branch.
      const branch =
        condition.conditions.find(canPlanConditionMutations) ?? condition.conditions.at(0);
      if (branch) planConditionMutationsInDraft(branch, completed, trackerData);
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
      if (seasonOrdinal(condition.season) > seasonOrdinal(completed.reachedSeason)) {
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

/** Scan completed story quests once, taking the maximum of all recorded & cascaded levels. */
function computeStoredHeartLevels(
  completed: DeepReadonly<ProgressState>,
  trackerData: TrackerData,
): Partial<Record<VillagerId, number>> {
  const levels = { ...completed.heartLevels };
  for (const [questId, state] of recordEntries(completed.questStates)) {
    if (state !== "completed") continue;
    if (!(questId in trackerData.quests.story)) continue;
    const quest = trackerData.quests.story[questId];
    for (const change of quest.heartLevelChanges ?? []) {
      levels[change.villagerId] = Math.max(levels[change.villagerId] ?? 0, change.level);
    }
  }
  return levels;
}

/** Recorded category gates require acquired quests & raw heart levels, independent of display. */
function recordedProgressContext(
  completed: DeepReadonly<ProgressState>,
  trackerData: TrackerData,
): ConditionContext {
  const context: ConditionContext = {
    hasUpperFloor: completed.hasUpperFloor,
    heartLevels: completed.heartLevels,
    isDating: recordKeys(completed.villagerRelationships).some((villagerId) =>
      isRomantic(completed.villagerRelationships, villagerId),
    ),
    isVillagerKnown: (villagerId) =>
      evaluateCondition(trackerData.villagers[villagerId].visibility, context),
    marriedVillager: getSpouseId(completed.villagerRelationships),
    mineFloor: completed.mineFloor,
    questStatus: (questId) => {
      const stored = completed.questStates[questId] ?? "none";
      switch (stored) {
        case "completed":
          return "completed";
        case "obtained":
          return "available";
        case "none":
          return "unavailable";
      }
    },
    reachedSeason: completed.reachedSeason,
    renown: completed.renown,
    skillLevels: completed.skillLevels,
    unlockedPerks: completed.unlockedPerks,
  };
  return context;
}

/** Quest fixpoint & villager discovery use derived quest statuses without claiming known villagers. */
function questProgressContext(
  recorded: ConditionContext,
  questVisibility: Record<QuestId, QuestVisibility>,
): ConditionContext {
  return {
    ...recorded,
    isVillagerKnown: () => false,
    questStatus: (questId) => questVisibility[questId],
  };
}

/**
 * Quest visibility is independent of quest key order: quests the player has obtained or completed
 * are fixed by their state, and the rest start "unavailable" and are re-evaluated until nothing
 * changes. Every condition is monotone, so this reaches the least fixpoint; quests in a
 * prerequisite cycle stay "unavailable".
 */
function deriveQuestVisibility(
  completed: DeepReadonly<ProgressState>,
  trackerData: TrackerData,
  recorded: ConditionContext,
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

  const derived = questProgressContext(recorded, questVisibility);
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
        recorded,
        derived,
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
  completed: DeepReadonly<ProgressState>,
  recorded: ConditionContext,
  baseCondition: VisibilityCondition,
): QuestVisibility {
  const index = order.indexOf(questId);
  if (index === -1) return "unavailable";
  if (!evaluateCondition(baseCondition, recorded)) return "unavailable";
  if (index === 0) return "available";
  const prevQuestId = order[index - 1];
  return completed.questStates[prevQuestId] === "completed" ? "available" : "unavailable";
}

function evaluateQuestPrerequisites(
  questId: QuestId,
  questType: QuestType,
  completed: DeepReadonly<ProgressState>,
  trackerData: TrackerData,
  recorded: ConditionContext,
  derived: ConditionContext,
): QuestVisibility {
  const order = trackerData.questOrder[questType];
  if (order) {
    const categoryVis = trackerData.categoryVisibility[questType] ?? { type: "always" as const };
    return evaluateOrderedChain(order, questId, completed, recorded, categoryVis);
  }

  const quest = trackerData.quests[questType][questId];
  if (!quest.visibility) return "available";

  return evaluateCondition(quest.visibility, derived) ? "available" : "unavailable";
}

// ─── Progression state derivation ───────────────────────────────────

function findQuestType(questId: QuestId, trackerData: TrackerData): QuestType | undefined {
  for (const [questType, quests] of recordEntries(trackerData.quests)) {
    if (questId in quests) return questType;
  }
  return undefined;
}

function markOrderedPredecessorsCompleted(
  order: QuestId[],
  questId: QuestId,
  completed: ConditionDraft,
  trackerData: TrackerData,
): void {
  const index = order.indexOf(questId);
  if (index <= 0) return;
  for (let i = 0; i < index; i++) markQuestCompleted(order[i], completed, trackerData);
}

/** Marks `questId` completed, first recursively completing everything it's chained behind. */
function markQuestCompleted(
  questId: QuestId,
  completed: ConditionDraft,
  trackerData: TrackerData,
): void {
  if (completed.questStates[questId] === "completed") return;
  markQuestPrerequisitesCompleted(questId, completed, trackerData);
  completed.questStates[questId] = "completed";
}

function markQuestPrerequisitesCompleted(
  questId: QuestId,
  completed: ConditionDraft,
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
    planConditionMutationsInDraft(quest.visibility, completed, trackerData);
  }
}
