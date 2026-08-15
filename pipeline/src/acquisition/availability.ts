import { simplifyAvailabilityCondition } from "$lib/engine/availability-condition.js";

import type {
  AvailabilityCondition,
  JsonValue,
  NpcId,
  PerkId,
  QuestId,
  Season,
  SkillId,
  Weather,
} from "$lib/types/tracker-data.js";

import type { SourceFieldLocation } from "../data-shapes.js";
import type { RequirementContext, RequirementExpression } from "../requirements.js";

const ALL_SEASONS = new Set<Season>(["fall", "spring", "summer", "winter"]);

export function projectRequirementExpressionToAvailability(
  expression: RequirementExpression,
  context: RequirementContext,
  sourceLocation: SourceFieldLocation,
): AvailabilityCondition {
  if ("all" in expression) {
    return simplifyAvailabilityCondition({
      conditions: expression.all.map((child) =>
        projectRequirementExpressionToAvailability(child, context, sourceLocation),
      ),
      type: "all",
    });
  }
  if ("any" in expression) {
    return simplifyAvailabilityCondition({
      conditions: expression.any.map((child) =>
        projectRequirementExpressionToAvailability(child, context, sourceLocation),
      ),
      type: "any",
    });
  }
  if ("not" in expression) {
    return simplifyAvailabilityCondition({
      condition: projectRequirementExpressionToAvailability(
        expression.not,
        context,
        sourceLocation,
      ),
      type: "not",
    });
  }

  return projectPredicate(expression.predicate, expression.value, context, sourceLocation);
}

function invalidJsonValue(fieldPath: string, received: string): Error {
  return new Error(`Invalid JSON value at ${fieldPath}: ${received}`);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}

function numberPair(value: unknown): [number, number] | undefined {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !isFiniteNumber(value[0]) ||
    !isFiniteNumber(value[1])
  ) {
    return undefined;
  }
  return [value[0], value[1]];
}

function projectLevelRecord(
  value: unknown,
  type: "heart" | "skill",
): AvailabilityCondition | undefined {
  if (!isRecord(value)) return undefined;

  const entries = Object.entries(value);
  if (entries.length === 0 || entries.some(([, level]) => !isFiniteNumber(level))) return undefined;

  const conditions = entries.map(([id, level]) =>
    type === "heart"
      ? { level, npcId: id as NpcId, type: "heartLevel" as const }
      : { level, skillId: id as SkillId, type: "skillLevel" as const },
  );
  return simplifyAvailabilityCondition({ conditions, type: "all" });
}

function projectPredicate(
  predicate: string,
  value: unknown,
  context: RequirementContext,
  sourceLocation: SourceFieldLocation,
): AvailabilityCondition {
  switch (predicate) {
    case "completed_quest":
      if (typeof value === "string") {
        return { questId: value as QuestId, state: "completed", type: "quest" };
      }
      break;
    case "has_perk":
      if (typeof value === "string") {
        return { perkId: value as PerkId, type: "perkUnlocked" };
      }
      break;
    case "in_time_range": {
      const range = numberPair(value);
      if (range) return { start: range[0], end: range[1], type: "time" };
      break;
    }
    case "is_season": {
      const seasons = stringValues(value);
      if (seasons) {
        if (
          ALL_SEASONS.size === seasons.length &&
          seasons.every((season) => ALL_SEASONS.has(season))
        ) {
          return { type: "always" };
        }
        return { seasons: seasons as Season[], type: "season" };
      }
      break;
    }
    case "is_weather": {
      const weathers = stringValues(value);
      if (weathers) return { type: "weather", weathers: weathers as Weather[] };
      break;
    }
    case "reached_heart_level": {
      const condition = projectLevelRecord(value, "heart");
      if (condition) return condition;
      break;
    }
    case "reached_mines_level":
      if (typeof value === "number" && Number.isFinite(value)) {
        return { floor: value, type: "minesLevel" };
      }
      break;
    case "reached_skill_level": {
      const condition = projectLevelRecord(value, "skill");
      if (condition) return condition;
      break;
    }
    case "seen_cutscene":
      if (typeof value === "string") {
        const cutscene = context.cutsceneMap[value];
        if (cutscene) {
          return { questId: cutscene.questId, state: cutscene.phase, type: "quest" };
        }
      }
      break;
  }

  return {
    predicate,
    type: "gamePredicate",
    value: toJsonValue(value, sourceFieldPath(sourceLocation, predicate), new Set()),
  };
}

function sourceFieldPath(sourceLocation: SourceFieldLocation, predicate: string): string {
  const prefix = sourceLocation.entityId ? `${sourceLocation.entityId}.` : "";
  return `${prefix}${sourceLocation.fieldPath}.${predicate}`;
}

function stringValues(value: unknown): string[] | undefined {
  if (typeof value === "string") return [value];
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) return undefined;
  return value;
}

function toJsonValue(value: unknown, fieldPath: string, activeObjects: Set<object>): JsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (Number.isFinite(value)) return value;
    throw invalidJsonValue(fieldPath, "non-finite number");
  }
  if (typeof value !== "object") throw invalidJsonValue(fieldPath, typeof value);
  if (activeObjects.has(value)) throw invalidJsonValue(fieldPath, "cyclic value");

  activeObjects.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((entry, index) =>
        toJsonValue(entry, `${fieldPath}[${index}]`, activeObjects),
      );
    }
    if (!isRecord(value)) throw invalidJsonValue(fieldPath, "non-record object");
    const symbols = Object.getOwnPropertySymbols(value);
    if (symbols.length > 0) throw invalidJsonValue(fieldPath, "symbol property");

    const result: Record<string, JsonValue> = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = toJsonValue(entry, `${fieldPath}.${key}`, activeObjects);
    }
    return result;
  } finally {
    activeObjects.delete(value);
  }
}
