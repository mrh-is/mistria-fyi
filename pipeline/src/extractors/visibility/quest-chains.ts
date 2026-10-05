import { buildRequirementDefinitions, parseRequirements } from "../../requirements.js";

import type { QuestId, VillagerId } from "#lib/types/tracker-data.js";

import type { ParsedGameData } from "../../parse-fiddle.js";
import type { RequirementExpression } from "../../requirements.js";

export interface QuestChainData {
  crown: QuestId[];
  fetch: Record<QuestId, RequirementExpression>;
  heart: Record<
    VillagerId,
    { heartLevel: number; prerequisiteQuest?: QuestId; questId: QuestId }[]
  >;
  stillwell: QuestId[];
  story: Record<QuestId, { prerequisites: QuestId[] }>;
  tali: QuestId[];
}

interface HeartChainEntry {
  heartLevel: number;
  questId: QuestId;
  villagerId: VillagerId;
}

/**
 * Walks four data sources to build the raw quest-chain skeleton the app's `deriveProgressionState`
 * uses to gate unavailable content: story prerequisites and heart-level chains come from
 * `letters.toml`, crown/stillwell/tali ordering comes from their registry files' `order` arrays,
 * and fetch-quest requirements come from `request_board.toml`. Fetch requirements are left as raw
 * `RequirementExpression` trees — Task 5's `assignEntityVisibility` resolves them into
 * `VisibilityCondition`.
 */
export function extractQuestChains(fiddle: ParsedGameData): QuestChainData {
  const questGroups = fiddle.quests as Record<string, Record<string, unknown>> | undefined;
  const letters = fiddle.letters as Record<string, Record<string, unknown>> | undefined;
  const cutscenes = fiddle.cutscenes as Record<string, Record<string, unknown>> | undefined;

  const story = extractStoryChain(questGroups, letters, cutscenes);
  const heart = extractHeartChain(letters, questGroups);
  const crown = extractRegistryOrder(questGroups, "crown_registry");
  const stillwell = extractRegistryOrder(questGroups, "stillwell_registry");
  const tali = extractRegistryOrder(questGroups, "tali_registry");
  const fetch = extractFetchChain(fiddle, questGroups);

  console.log(
    `  Quest chains: ${Object.keys(story).length} story, ${Object.keys(heart).length} heart villagers, ` +
      `${crown.length} crown, ${stillwell.length} stillwell, ${tali.length} tali, ` +
      `${Object.keys(fetch).length} fetch`,
  );

  return { crown, fetch, heart, stillwell, story, tali };
}

/**
 * A letter's `completed_quest` requirement may be a bare quest ID string or an object with a
 * `quest` field (plus e.g. `days_after`); either form resolves to the same prerequisite ID.
 */
function extractCompletedQuestId(requirements: unknown): QuestId | undefined {
  if (typeof requirements !== "object" || requirements === null) return undefined;
  const completedQuest = (requirements as Record<string, unknown>).completed_quest;
  if (typeof completedQuest === "string") return completedQuest as QuestId;
  if (typeof completedQuest === "object" && completedQuest !== null) {
    const quest = (completedQuest as Record<string, unknown>).quest;
    if (typeof quest === "string") return quest as QuestId;
  }
  return undefined;
}

function extractFetchChain(
  fiddle: ParsedGameData,
  questGroups: Record<string, Record<string, unknown>> | undefined,
): Record<QuestId, RequirementExpression> {
  const fetch: Record<QuestId, RequirementExpression> = {};
  const requestBoard = questGroups?.request_board;
  if (!requestBoard) return fetch;

  const requirementsData = fiddle.requirements as Record<string, unknown> | undefined;
  const { namedRequirements, primitivePredicates } = requirementsData
    ? buildRequirementDefinitions(requirementsData)
    : { namedRequirements: {}, primitivePredicates: new Set<string>() };

  for (const [questId, entry] of Object.entries(requestBoard)) {
    if (questId === "default" || typeof entry !== "object" || entry === null) continue;

    const requirements = (entry as Record<string, unknown>).requirements;
    const expression = parseRequirements(requirements, namedRequirements, primitivePredicates, {
      entityId: questId,
      fieldPath: "requirements",
      sourcePath: "quests/request_board.toml",
    });
    fetch[questId as QuestId] = expression;
  }

  return fetch;
}

/**
 * Groups heart-level letters by the villager key named in the letter's own `reached_heart_level`
 * requirement, not the triggered quest's `npc_for_icon` — the two diverge for cross-villager gates
 * like Landen's "Bird Song", which is gated on Ryis's heart level.
 */
function extractHeartChain(
  letters: Record<string, Record<string, unknown>> | undefined,
  questGroups: Record<string, Record<string, unknown>> | undefined,
): Record<VillagerId, { heartLevel: number; prerequisiteQuest?: QuestId; questId: QuestId }[]> {
  const entriesByVillager = new Map<VillagerId, HeartChainEntry[]>();

  if (letters) {
    for (const [letterId, letter] of Object.entries(letters)) {
      if (letterId === "default" || typeof letter !== "object" || letter === null) continue;

      const questId = letter.quest_to_start;
      if (typeof questId !== "string") continue;

      const requirements = letter.requirements;
      if (typeof requirements !== "object" || requirements === null) continue;
      const reachedHeartLevel = (requirements as Record<string, unknown>).reached_heart_level;
      if (typeof reachedHeartLevel !== "object" || reachedHeartLevel === null) continue;

      const [villagerId, level] = Object.entries(reachedHeartLevel)[0] ?? [];
      if (villagerId === undefined || typeof level !== "number") continue;

      const entries = entriesByVillager.get(villagerId as VillagerId) ?? [];
      entries.push({
        heartLevel: level,
        questId: questId as QuestId,
        villagerId: villagerId as VillagerId,
      });
      entriesByVillager.set(villagerId as VillagerId, entries);
    }
  }

  const requestBoard = questGroups?.request_board as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (requestBoard) {
    for (const [questId, entry] of Object.entries(requestBoard)) {
      if (questId === "default" || typeof entry !== "object" || entry === null) continue;

      const requirements = entry.requirements as Record<string, unknown> | undefined;
      if (!requirements) continue;
      const reachedHeartLevel = requirements.reached_heart_level;
      if (typeof reachedHeartLevel !== "object" || reachedHeartLevel === null) continue;

      const [villagerId, level] = Object.entries(reachedHeartLevel)[0] ?? [];
      if (villagerId === undefined || typeof level !== "number") continue;

      const entries = entriesByVillager.get(villagerId as VillagerId) ?? [];
      entries.push({
        heartLevel: level,
        questId: questId as QuestId,
        villagerId: villagerId as VillagerId,
      });
      entriesByVillager.set(villagerId as VillagerId, entries);
    }
  }

  const heart: Record<
    VillagerId,
    { heartLevel: number; prerequisiteQuest?: QuestId; questId: QuestId }[]
  > = {};

  for (const [villagerId, rawEntries] of entriesByVillager) {
    // Some Villagers have alternate letter variants (e.g. branching by a world-state flag) that gate
    // the same quest at the same heart level; collapse those duplicates before chaining.
    const seen = new Set<string>();
    const entries = rawEntries.filter((entry) => {
      const key = `${entry.heartLevel}:${entry.questId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    entries.sort((a, b) => a.heartLevel - b.heartLevel);
    heart[villagerId] = entries.map((entry, index) => {
      if (entry.heartLevel < 4 || index === 0) {
        return { heartLevel: entry.heartLevel, questId: entry.questId };
      }
      return {
        heartLevel: entry.heartLevel,
        prerequisiteQuest: entries[index - 1].questId,
        questId: entry.questId,
      };
    });
  }

  return heart;
}

function extractRegistryOrder(
  questGroups: Record<string, Record<string, unknown>> | undefined,
  registryKey: string,
): QuestId[] {
  const registry = questGroups?.[registryKey];
  if (!registry || typeof registry !== "object") return [];

  const order = registry.order;
  if (!Array.isArray(order)) return [];

  return order.filter((entry): entry is string => typeof entry === "string") as QuestId[];
}

/**
 * Hardcoded story-quest prerequisites for quests whose triggering mechanism (cutscene, quest
 * reward, or location gate) can't be extracted from letters or cutscene `completed_quest` fields.
 * Each entry maps a quest to the quest(s) that must be completed before it becomes available.
 */
const STORY_PREREQUISITE_OVERRIDES: Partial<Record<QuestId, QuestId[]>> = {
  ["breaking_the_final_seal" as QuestId]: ["the_dragonsworn_tablet" as QuestId],
  ["breaking_the_fire_seal" as QuestId]: ["the_fire_tablet" as QuestId],
  ["breaking_the_ruins_seal" as QuestId]: ["creating_the_void_mass" as QuestId],
  ["creating_the_void_mass" as QuestId]: ["find_the_magic_key" as QuestId],
  ["delivering_the_sealing_scroll" as QuestId]: ["procuring_the_sealing_scroll" as QuestId],
  ["find_the_magic_key" as QuestId]: ["breaking_the_fire_seal" as QuestId],
  ["the_dragonsworn_tablet" as QuestId]: ["breaking_the_ruins_seal" as QuestId],
};

/**
 * Story-quest IDs come from the `story_quests` quest group; every one gets a `story` entry, with
 * prerequisites populated from three sources:
 *
 * 1. Letters whose `quest_to_start`/`quest_to_progress` points at a story quest and whose
 *    `requirements.completed_quest` names the prerequisite.
 * 2. Cutscenes with the same `quest_to_start`/`quest_to_progress` + `completed_quest` pattern.
 * 3. `STORY_PREREQUISITE_OVERRIDES` for quests whose prerequisites can't be extracted from data
 *    (e.g. quests started by cutscenes without `completed_quest`, or by quest rewards).
 */
function extractStoryChain(
  questGroups: Record<string, Record<string, unknown>> | undefined,
  letters: Record<string, Record<string, unknown>> | undefined,
  cutscenes: Record<string, Record<string, unknown>> | undefined,
): Record<QuestId, { prerequisites: QuestId[] }> {
  const story: Record<QuestId, { prerequisites: QuestId[] }> = {};

  const storyQuests = questGroups?.story_quests;
  if (storyQuests) {
    for (const questId of Object.keys(storyQuests)) {
      if (questId === "default") continue;
      story[questId as QuestId] = { prerequisites: [] };
    }
  }

  for (const source of [letters, cutscenes]) {
    if (!source) continue;
    for (const entry of Object.values(source)) {
      if (typeof entry !== "object" || entry === null) continue;

      const questToStart = entry.quest_to_start;
      const questToProgress = entry.quest_to_progress;
      const candidates = Array.isArray(questToStart)
        ? [...questToStart, questToProgress]
        : [questToStart, questToProgress];

      const triggeredQuestIds = candidates.filter(
        (id): id is string => typeof id === "string" && id in story,
      );
      if (triggeredQuestIds.length === 0) continue;

      const prerequisiteId = extractCompletedQuestId(entry.requirements);
      if (!prerequisiteId) continue;

      for (const questId of triggeredQuestIds) {
        const chainEntry = story[questId as QuestId];
        if (!chainEntry.prerequisites.includes(prerequisiteId)) {
          chainEntry.prerequisites.push(prerequisiteId);
        }
      }
    }
  }

  for (const [questId, prerequisites] of Object.entries(STORY_PREREQUISITE_OVERRIDES)) {
    const chainEntry = story[questId as QuestId];
    if (!chainEntry || !prerequisites) continue;
    for (const prereq of prerequisites) {
      if (!chainEntry.prerequisites.includes(prereq)) {
        chainEntry.prerequisites.push(prereq);
      }
    }
  }

  return story;
}
