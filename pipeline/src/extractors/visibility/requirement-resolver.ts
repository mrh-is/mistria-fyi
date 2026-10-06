import type { QuestId, SkillId, VillagerId } from "#lib/types/tracker-data.js";
import type { VisibilityCondition } from "#lib/types/visibility.js";

import type { RequirementExpression } from "../../requirements.js";
import type { CutsceneQuestMap } from "./cutscene-quest-map.js";

const NON_SPOILER_PREDICATES = new Set([
  "acquired_item",
  "has_upper_floor",
  "is_day_type",
  "is_season",
  "reached_date",
]);

/** The unconditional visibility, shared so every module emits the same shape. */
export const ALWAYS_VISIBLE: VisibilityCondition = Object.freeze({ type: "always" });

export function resolveToVisibility(
  expr: RequirementExpression,
  cutsceneMap: CutsceneQuestMap,
): VisibilityCondition {
  if ("all" in expr) {
    const conditions = expr.all.map((e) => resolveToVisibility(e, cutsceneMap));
    return simplifyCondition({
      type: "and",
      conditions: conditions as [VisibilityCondition, ...VisibilityCondition[]],
    });
  }
  if ("any" in expr) {
    const conditions = expr.any.map((e) => resolveToVisibility(e, cutsceneMap));
    return simplifyCondition({
      type: "or",
      conditions: conditions as [VisibilityCondition, ...VisibilityCondition[]],
    });
  }
  if ("not" in expr) {
    return ALWAYS_VISIBLE;
  }

  // Predicate leaf
  const { predicate, value } = expr;

  if (NON_SPOILER_PREDICATES.has(predicate)) return ALWAYS_VISIBLE;

  if (predicate === "seen_cutscene" && typeof value === "string") {
    const entry = cutsceneMap[value];
    if (!entry) return ALWAYS_VISIBLE;
    return entry.phase === "completed"
      ? { type: "questCompleted", questId: entry.questId }
      : { type: "questAvailable", questId: entry.questId };
  }

  if (predicate === "completed_quest" && typeof value === "string") {
    return { type: "questCompleted", questId: value as QuestId };
  }

  if (predicate === "met_villager") {
    if (typeof value === "string") {
      return { type: "villagerKnown", villagerId: value as VillagerId };
    }
    if (Array.isArray(value)) {
      const conditions = value.map((villager) => ({
        type: "villagerKnown" as const,
        villagerId: villager as VillagerId,
      }));
      return simplifyCondition({
        type: "and",
        conditions: conditions as [VisibilityCondition, ...VisibilityCondition[]],
      });
    }
    return ALWAYS_VISIBLE;
  }

  if (predicate === "reached_skill_level" && typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, number>);
    if (entries.length === 1) {
      const [skillId, level] = entries[0];
      return { type: "skillLevel", level, skillId: skillId as SkillId };
    }
    const conditions = entries.map(([skillId, level]) => ({
      type: "skillLevel" as const,
      level,
      skillId: skillId as SkillId,
    }));
    return simplifyCondition({
      type: "and",
      conditions: conditions as [VisibilityCondition, ...VisibilityCondition[]],
    });
  }

  if (predicate === "reached_mines_level" && typeof value === "number") {
    return { type: "mineFloor", floor: value };
  }

  if (predicate === "reached_heart_level" && typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, number>);
    if (entries.length === 1) {
      const [villagerId, level] = entries[0];
      return { type: "heartLevel", level, villagerId: villagerId as VillagerId };
    }
    const conditions = entries.map(([villagerId, level]) => ({
      type: "heartLevel" as const,
      level,
      villagerId: villagerId as VillagerId,
    }));
    return simplifyCondition({
      type: "and",
      conditions: conditions as [VisibilityCondition, ...VisibilityCondition[]],
    });
  }

  // Unknown predicates — project to always (forward compatibility)
  return ALWAYS_VISIBLE;
}

export function simplifyCondition(condition: VisibilityCondition): VisibilityCondition {
  if (condition.type === "and") {
    const simplified = condition.conditions
      .map(simplifyCondition)
      .filter((c) => c.type !== "always");
    if (simplified.length === 0) return ALWAYS_VISIBLE;
    if (simplified.length === 1) return simplified[0];
    return {
      type: "and",
      conditions: simplified as [VisibilityCondition, ...VisibilityCondition[]],
    };
  }
  if (condition.type === "or") {
    const simplified = condition.conditions.map(simplifyCondition);
    if (simplified.some((c) => c.type === "always")) return ALWAYS_VISIBLE;
    if (simplified.length === 0) return ALWAYS_VISIBLE;
    if (simplified.length === 1) return simplified[0];
    return {
      type: "or",
      conditions: simplified as [VisibilityCondition, ...VisibilityCondition[]],
    };
  }
  return condition;
}
