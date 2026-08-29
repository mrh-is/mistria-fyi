import type { QuestId } from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../../parse-fiddle.js";

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
  // Access cutscenes from either the nested structure or flat structure
  const cutscenes =
    ((fiddle.cutscenes as Record<string, unknown> | undefined)?.cutscenes as
      Record<string, Record<string, unknown>> | undefined) ??
    (fiddle.cutscenes as Record<string, Record<string, unknown>> | undefined);

  if (cutscenes) {
    for (const [cutsceneId, cutscene] of Object.entries(cutscenes)) {
      if (cutsceneId === "default" || typeof cutscene !== "object" || cutscene === null) continue;

      if (typeof cutscene.quest_to_start === "string") {
        map[cutsceneId] = {
          phase: "available",
          questId: cutscene.quest_to_start as QuestId,
        };
      }
      if (typeof cutscene.quest_to_progress === "string") {
        map[cutsceneId] = {
          phase: "completed",
          questId: cutscene.quest_to_progress as QuestId,
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

  // Source 3: Naming convention — strip _pt_N suffix, match against quest IDs
  if (cutscenes) {
    for (const cutsceneId of Object.keys(cutscenes)) {
      if (cutsceneId === "default" || cutsceneId in map) continue;
      const ptMatch = /^(.+)_pt_(\d+)$/.exec(cutsceneId);
      if (!ptMatch) continue;
      const baseId = ptMatch[1];
      const partNumber = parseInt(ptMatch[2], 10);
      if (allQuestIds.has(baseId)) {
        map[cutsceneId] = {
          phase: partNumber >= 2 ? "completed" : "available",
          questId: baseId as QuestId,
        };
      }
    }
  }

  // Explicit overrides for cutscenes that cannot be derived from quest data
  if (!("destroy_vines_eastern_road" in map)) {
    map.destroy_vines_eastern_road = {
      phase: "completed",
      questId: "breaking_the_fire_seal" as QuestId,
    };
  }

  console.log(`  Cutscene-quest map: ${Object.keys(map).length} cutscenes mapped`);
  return map;
}
