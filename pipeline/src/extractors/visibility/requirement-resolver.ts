import type { NpcId, QuestId, SkillId } from "$lib/types/tracker-data.js";
import type { VisibilityCondition } from "$lib/types/visibility.js";

import type { RequirementExpression } from "../../requirements.js";
import type { CutsceneQuestMap } from "./cutscene-quest-map.js";

const NON_SPOILER_PREDICATES = new Set([
  "acquired_item",
  "has_upper_floor",
  "is_day_type",
  "is_season",
  "reached_date",
]);

const ALWAYS: VisibilityCondition = { type: "always" };

export function resolveToVisibility(
  expr: RequirementExpression,
  cutsceneMap: CutsceneQuestMap,
): VisibilityCondition {
  if ("all" in expr) {
    const conditions = expr.all.map((e) => resolveToVisibility(e, cutsceneMap));
    return simplifyCondition({
      conditions: conditions as [VisibilityCondition, ...VisibilityCondition[]],
      type: "and",
    });
  }
  if ("any" in expr) {
    const conditions = expr.any.map((e) => resolveToVisibility(e, cutsceneMap));
    return simplifyCondition({
      conditions: conditions as [VisibilityCondition, ...VisibilityCondition[]],
      type: "or",
    });
  }
  if ("not" in expr) {
    return ALWAYS;
  }

  // Predicate leaf
  const { predicate, value } = expr;

  if (NON_SPOILER_PREDICATES.has(predicate)) return ALWAYS;

  if (predicate === "seen_cutscene" && typeof value === "string") {
    const entry = cutsceneMap[value];
    if (!entry) return ALWAYS;
    return entry.phase === "completed"
      ? { questId: entry.questId, type: "questCompleted" }
      : { questId: entry.questId, type: "questAvailable" };
  }

  if (predicate === "completed_quest" && typeof value === "string") {
    return { questId: value as QuestId, type: "questCompleted" };
  }

  if (predicate === "met_npc") {
    if (typeof value === "string") {
      return { npcId: value as NpcId, type: "npcKnown" };
    }
    if (Array.isArray(value)) {
      const conditions = value.map((npc) => ({
        npcId: npc as NpcId,
        type: "npcKnown" as const,
      }));
      return simplifyCondition({
        conditions: conditions as [VisibilityCondition, ...VisibilityCondition[]],
        type: "and",
      });
    }
    return ALWAYS;
  }

  if (predicate === "reached_skill_level" && typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, number>);
    if (entries.length === 1) {
      const [skillId, level] = entries[0];
      return { level, skillId: skillId as SkillId, type: "skillLevel" };
    }
    const conditions = entries.map(([skillId, level]) => ({
      level,
      skillId: skillId as SkillId,
      type: "skillLevel" as const,
    }));
    return simplifyCondition({
      conditions: conditions as [VisibilityCondition, ...VisibilityCondition[]],
      type: "and",
    });
  }

  if (predicate === "reached_mines_level" && typeof value === "number") {
    return { floor: value, type: "minesLevel" };
  }

  if (predicate === "reached_heart_level" && typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, number>);
    if (entries.length === 1) {
      const [npcId, level] = entries[0];
      return { level, npcId: npcId as NpcId, type: "heartLevel" };
    }
    const conditions = entries.map(([npcId, level]) => ({
      level,
      npcId: npcId as NpcId,
      type: "heartLevel" as const,
    }));
    return simplifyCondition({
      conditions: conditions as [VisibilityCondition, ...VisibilityCondition[]],
      type: "and",
    });
  }

  // Unknown predicates — project to always (forward compatibility)
  return ALWAYS;
}

export function simplifyCondition(condition: VisibilityCondition): VisibilityCondition {
  if (condition.type === "and") {
    const simplified = condition.conditions
      .map(simplifyCondition)
      .filter((c) => c.type !== "always");
    if (simplified.length === 0) return ALWAYS;
    if (simplified.length === 1) return simplified[0];
    return {
      conditions: simplified as [VisibilityCondition, ...VisibilityCondition[]],
      type: "and",
    };
  }
  if (condition.type === "or") {
    const simplified = condition.conditions.map(simplifyCondition);
    if (simplified.some((c) => c.type === "always")) return ALWAYS;
    if (simplified.length === 0) return ALWAYS;
    if (simplified.length === 1) return simplified[0];
    return {
      conditions: simplified as [VisibilityCondition, ...VisibilityCondition[]],
      type: "or",
    };
  }
  return condition;
}
