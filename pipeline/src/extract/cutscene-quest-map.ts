import { expectNumber, expectRecord, expectString, expectStringArray } from "../data-shapes.js";
import { CUTSCENE_QUESTS } from "../overrides/game-facts.js";
import { getCutsceneRecords, sourceFileFor } from "../parse/parse-fiddle.js";

import type { QuestId } from "#lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse/parse-fiddle.js";

export interface CutsceneQuestEntry {
  phase: "available" | "completed";
  questId: QuestId;
}

export type CutsceneQuestMap = Record<string, CutsceneQuestEntry>;

export function buildCutsceneQuestMap(fiddle: ParsedGameData): CutsceneQuestMap {
  const map: CutsceneQuestMap = {};

  // Collect all known quest IDs (skip "default" placeholder entries)
  const allQuestIds = new Set<string>();
  const questGroups = fiddle.quests as Record<string, Record<string, unknown>> | undefined;
  if (questGroups) {
    for (const group of Object.values(questGroups)) {
      if (typeof group === "object" && group !== null) {
        for (const questId of Object.keys(group)) {
          if (questId !== "default") {
            allQuestIds.add(questId);
          }
        }
      }
    }
  }

  // Source 1: Explicit quest_to_start / quest_to_progress on cutscene entries
  const cutscenes = getCutsceneRecords(fiddle);

  if (cutscenes) {
    for (const [cutsceneId, cutscene] of Object.entries(cutscenes)) {
      if (cutsceneId === "default" || typeof cutscene !== "object" || cutscene === null) continue;

      const questToStart = questToStartId(fiddle, cutsceneId, cutscene.quest_to_start);
      if (questToStart !== undefined) {
        map[cutsceneId] = { phase: "available", questId: questToStart };
      }
      if (cutscene.quest_to_progress !== undefined) {
        map[cutsceneId] = {
          phase: "completed",
          questId: expectString(cutscene.quest_to_progress, {
            entityId: cutsceneId,
            fieldPath: "quest_to_progress",
            sourcePath: sourceFileFor(fiddle, "cutscenes"),
          }) as QuestId,
        };
      }
    }
  }

  // Source 2: Quest stage queries[].cutscene references
  if (questGroups) {
    for (const group of Object.values(questGroups)) {
      if (typeof group !== "object" || group === null) continue;
      for (const [questId, quest] of Object.entries(group)) {
        if (questId === "default" || typeof quest !== "object" || quest === null) continue;
        const stages = (quest as Record<string, unknown>).stages;
        if (!Array.isArray(stages)) continue;
        for (const stage of stages) {
          if (typeof stage !== "object" || stage === null) continue;
          const queries = (stage as Record<string, unknown>).queries;
          if (!Array.isArray(queries)) continue;
          for (const query of queries) {
            if (typeof query !== "object" || query === null) continue;
            const cutsceneRef = (query as Record<string, unknown>).cutscene;
            if (typeof cutsceneRef === "string" && !(cutsceneRef in map)) {
              map[cutsceneRef] = {
                phase: "available",
                questId: questId as QuestId,
              };
            }
          }
        }
      }
    }
  }

  // Source 3: seals.toml pairs each seal-breaking cutscene with the quest it completes
  for (const [cutsceneId, entry] of Object.entries(extractSealCutsceneQuests(fiddle))) {
    if (!(cutsceneId in map)) map[cutsceneId] = entry;
  }

  // Source 4: Naming convention — strip _pt_N suffix, match against quest IDs
  if (cutscenes) {
    for (const cutsceneId of Object.keys(cutscenes)) {
      if (cutsceneId === "default" || cutsceneId in map) continue;
      const ptMatch = /^(.+)_pt_(\d+)$/.exec(cutsceneId);
      if (!ptMatch) continue;
      const baseId = ptMatch[1];
      const partNumber = Math.trunc(Number(ptMatch[2]));
      if (allQuestIds.has(baseId)) {
        map[cutsceneId] = {
          phase: partNumber >= 2 ? "completed" : "available",
          questId: baseId as QuestId,
        };
      }
    }
  }

  // Source 5: Setup cutscenes. When a quest-starting scene's only requirement is having seen
  // another scene, that setup scene marks the quest as about to become available, e.g.
  // find_the_weathervane_setup repairs the Horse Statue just before "Find the Weathervane" starts.
  // A follow-up with other gates (a day, a season) is skipped: seeing the setup scene wouldn't
  // imply the quest. Native links from sources 1–4 win; a reviewed entry or two quests claiming
  // one setup scene throw, so a game update can't silently remap either.
  if (cutscenes) {
    const setupQuests = new Map<string, QuestId>();
    for (const [cutsceneId, cutscene] of Object.entries(cutscenes)) {
      if (cutsceneId === "default" || typeof cutscene !== "object" || cutscene === null) continue;
      if (typeof cutscene.quest_to_start !== "string") continue;
      const requirements = cutscene.requirements as Record<string, unknown> | undefined;
      const setupId = requirements?.seen_cutscene;
      if (typeof setupId !== "string" || Object.keys(requirements ?? {}).length !== 1) continue;
      if (setupId in map && !setupQuests.has(setupId)) continue;

      const questId = cutscene.quest_to_start as QuestId;
      if (Object.hasOwn(CUTSCENE_QUESTS, setupId)) {
        throw new Error(
          `Setup cutscene "${setupId}" starts "${questId}" but has a reviewed CUTSCENE_QUEST_ENTRIES mapping; reconcile them`,
        );
      }
      const claimed = setupQuests.get(setupId);
      if (claimed !== undefined && claimed !== questId) {
        throw new Error(
          `Setup cutscene "${setupId}" gates both "${claimed}" and "${questId}"; add a reviewed CUTSCENE_QUEST_ENTRIES mapping`,
        );
      }
      setupQuests.set(setupId, questId);
      map[setupId] = { phase: "available", questId };
    }
  }

  // Explicit overrides for cutscenes that cannot be derived from quest data
  if (!("destroy_vines_eastern_road" in map)) {
    map.destroy_vines_eastern_road = CUTSCENE_QUESTS.destroy_vines_eastern_road;
  }

  console.log(`  Cutscene-quest map: ${Object.keys(map).length} cutscenes mapped`);
  return map;
}

/**
 * A cutscene that starts several quests starts them together, so seeing it is equivalent to the
 * first one becoming available.
 */
function questToStartId(
  fiddle: ParsedGameData,
  cutsceneId: string,
  value: unknown,
): QuestId | undefined {
  if (value === undefined) return undefined;
  const context = {
    entityId: cutsceneId,
    fieldPath: "quest_to_start",
    sourcePath: sourceFileFor(fiddle, "cutscenes"),
  };
  if (!Array.isArray(value)) return expectString(value, context) as QuestId;
  const [first] = expectStringArray(value, context);
  if (first === undefined) {
    throw new Error(`Expected at least one quest for ${cutsceneId}.quest_to_start`);
  }
  return first as QuestId;
}

/**
 * Maps each `seals.toml` cutscene to its seal's quest. The seal tablet advances its quest once after
 * the scene, so the scene completes the quest only when the seal names its final stage; anything
 * else throws. Seals without a cutscene (the priestess quarters) are skipped.
 */
export function extractSealCutsceneQuests(fiddle: ParsedGameData): CutsceneQuestMap {
  if (fiddle.seals === undefined) return {};
  const sourcePath = sourceFileFor(fiddle, "seals");
  const stageCounts = questStageCounts(fiddle);
  const map: CutsceneQuestMap = {};
  for (const [sealId, raw] of Object.entries(
    expectRecord(fiddle.seals, { fieldPath: "seals", sourcePath }),
  )) {
    const seal = expectRecord(raw, { fieldPath: `seals.${sealId}`, sourcePath });
    if (seal.cutscene === undefined) continue;
    const cutsceneId = expectString(seal.cutscene, {
      fieldPath: `seals.${sealId}.cutscene`,
      sourcePath,
    });
    const questId = expectString(seal.quest, { fieldPath: `seals.${sealId}.quest`, sourcePath });
    const stage = expectNumber(seal.stage, { fieldPath: `seals.${sealId}.stage`, sourcePath });
    const stageCount = stageCounts.get(questId);
    if (stageCount === undefined) {
      throw new Error(`Unknown quest ${questId} for seals.${sealId} in ${sourcePath}`);
    }
    if (stage !== stageCount - 1) {
      throw new Error(
        `Expected seals.${sealId}.stage in ${sourcePath} to be ${questId}'s final stage ${stageCount - 1}, got ${stage}`,
      );
    }
    if (cutsceneId in map) {
      throw new Error(`Duplicate seal cutscene ${cutsceneId} in ${sourcePath}`);
    }
    map[cutsceneId] = { phase: "completed", questId: questId as QuestId };
  }
  return map;
}

/** Counts each quest's stages, keyed by quest ID; quests without a stage list are omitted. */
function questStageCounts(fiddle: ParsedGameData): Map<string, number> {
  const counts = new Map<string, number>();
  const groups = fiddle.quests as Record<string, Record<string, unknown>> | undefined;
  for (const group of Object.values(groups ?? {})) {
    if (typeof group !== "object" || group === null) continue;
    for (const [questId, quest] of Object.entries(group)) {
      if (questId === "default" || typeof quest !== "object" || quest === null) continue;
      const stages = (quest as Record<string, unknown>).stages;
      if (Array.isArray(stages)) counts.set(questId, stages.length);
    }
  }
  return counts;
}
