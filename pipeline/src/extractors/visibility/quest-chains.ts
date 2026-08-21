import {
  buildRequirementDefinitions,
  parseRequirements,
  type RequirementExpression,
} from "../../requirements.js";

import type { NpcId, QuestId } from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../../parse-fiddle.js";

export interface QuestChainData {
  crown: QuestId[];
  fetch: Record<QuestId, RequirementExpression>;
  heart: Record<NpcId, { heartLevel: number; prerequisiteQuest?: QuestId; questId: QuestId }[]>;
  stillwell: QuestId[];
  story: Record<QuestId, { prerequisites: QuestId[] }>;
  tali: QuestId[];
}

interface HeartChainEntry {
  heartLevel: number;
  npcId: NpcId;
  questId: QuestId;
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

  const story = extractStoryChain(questGroups, letters);
  const heart = extractHeartChain(letters, questGroups);
  const crown = extractRegistryOrder(questGroups, "crown_registry");
  const stillwell = extractRegistryOrder(questGroups, "stillwell_registry");
  const tali = extractRegistryOrder(questGroups, "tali_registry");
  const fetch = extractFetchChain(fiddle, questGroups);

  console.log(
    `  Quest chains: ${Object.keys(story).length} story, ${Object.keys(heart).length} heart NPCs, ` +
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
 * Groups heart-level letters by the NPC key named in the letter's own `reached_heart_level`
 * requirement, not the triggered quest's `npc_for_icon` — the two diverge for cross-NPC gates
 * like Landen's "Bird Song", which is gated on Ryis's heart level.
 */
function extractHeartChain(
  letters: Record<string, Record<string, unknown>> | undefined,
  questGroups: Record<string, Record<string, unknown>> | undefined,
): Record<NpcId, { heartLevel: number; prerequisiteQuest?: QuestId; questId: QuestId }[]> {
  const entriesByNpc = new Map<NpcId, HeartChainEntry[]>();

  if (letters) {
    for (const [letterId, letter] of Object.entries(letters)) {
      if (letterId === "default" || typeof letter !== "object" || letter === null) continue;

      const questId = letter.quest_to_start;
      if (typeof questId !== "string") continue;

      const requirements = letter.requirements;
      if (typeof requirements !== "object" || requirements === null) continue;
      const reachedHeartLevel = (requirements as Record<string, unknown>).reached_heart_level;
      if (typeof reachedHeartLevel !== "object" || reachedHeartLevel === null) continue;

      const [npcId, level] = Object.entries(reachedHeartLevel)[0] ?? [];
      if (npcId === undefined || typeof level !== "number") continue;

      const entries = entriesByNpc.get(npcId as NpcId) ?? [];
      entries.push({ heartLevel: level, npcId: npcId as NpcId, questId: questId as QuestId });
      entriesByNpc.set(npcId as NpcId, entries);
    }
  }

  const requestBoard = questGroups?.request_board as
    Record<string, Record<string, unknown>> | undefined;
  if (requestBoard) {
    for (const [questId, entry] of Object.entries(requestBoard)) {
      if (questId === "default" || typeof entry !== "object" || entry === null) continue;

      const requirements = entry.requirements as Record<string, unknown> | undefined;
      if (!requirements) continue;
      const reachedHeartLevel = requirements.reached_heart_level;
      if (typeof reachedHeartLevel !== "object" || reachedHeartLevel === null) continue;

      const [npcId, level] = Object.entries(reachedHeartLevel)[0] ?? [];
      if (npcId === undefined || typeof level !== "number") continue;

      const entries = entriesByNpc.get(npcId as NpcId) ?? [];
      entries.push({ heartLevel: level, npcId: npcId as NpcId, questId: questId as QuestId });
      entriesByNpc.set(npcId as NpcId, entries);
    }
  }

  const heart: Record<
    NpcId,
    { heartLevel: number; prerequisiteQuest?: QuestId; questId: QuestId }[]
  > = {};

  for (const [npcId, rawEntries] of entriesByNpc) {
    // Some NPCs have alternate letter variants (e.g. branching by a world-state flag) that gate
    // the same quest at the same heart level; collapse those duplicates before chaining.
    const seen = new Set<string>();
    const entries = rawEntries.filter((entry) => {
      const key = `${entry.heartLevel}:${entry.questId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    entries.sort((a, b) => a.heartLevel - b.heartLevel);
    heart[npcId] = entries.map((entry, index) => {
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
 * Story-quest IDs come from the `story_quests` quest group; every one gets a `story` entry, with
 * prerequisites populated from the `completed_quest` requirement of whichever letter's
 * `quest_to_start` or `quest_to_progress` points at it.
 */
function extractStoryChain(
  questGroups: Record<string, Record<string, unknown>> | undefined,
  letters: Record<string, Record<string, unknown>> | undefined,
): Record<QuestId, { prerequisites: QuestId[] }> {
  const story: Record<QuestId, { prerequisites: QuestId[] }> = {};

  const storyQuests = questGroups?.story_quests;
  if (storyQuests) {
    for (const questId of Object.keys(storyQuests)) {
      if (questId === "default") continue;
      story[questId as QuestId] = { prerequisites: [] };
    }
  }

  if (letters) {
    for (const letter of Object.values(letters)) {
      if (typeof letter !== "object" || letter === null) continue;

      const triggeredQuestIds = [letter.quest_to_start, letter.quest_to_progress].filter(
        (id): id is string => typeof id === "string" && id in story,
      );
      if (triggeredQuestIds.length === 0) continue;

      const prerequisiteId = extractCompletedQuestId(letter.requirements);
      if (!prerequisiteId) continue;

      for (const questId of triggeredQuestIds) {
        const chainEntry = story[questId as QuestId];
        if (!chainEntry.prerequisites.includes(prerequisiteId)) {
          chainEntry.prerequisites.push(prerequisiteId);
        }
      }
    }
  }

  return story;
}
