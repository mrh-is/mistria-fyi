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
const ALL_WEATHERS = new Set<Weather>(["calm", "heavy_inclement", "inclement", "special"]);

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

function closedStringValues<T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
): T[] | undefined {
  const values = stringValues(value);
  if (
    !values ||
    values.length === 0 ||
    new Set(values).size !== values.length ||
    values.some((entry) => !allowed.has(entry as T))
  ) {
    return undefined;
  }
  return values as T[];
}

function invalidJsonValue(fieldPath: string, sourcePath: string, received: string): Error {
  return new Error(`Invalid JSON value at ${fieldPath} in ${sourcePath}: ${received}`);
}

function isArrayIndex(key: string, length: number): boolean {
  const index = Number(key);
  return Number.isInteger(index) && index >= 0 && index < length && String(index) === key;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
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
  const jsonValue = toJsonValue(
    value,
    sourceFieldPath(sourceLocation, predicate),
    sourceLocation.sourcePath,
    new Set(),
  );

  switch (predicate) {
    case "completed_quest":
      if (typeof jsonValue === "string") {
        return { questId: jsonValue as QuestId, state: "completed", type: "quest" };
      }
      break;
    case "has_perk":
      if (typeof jsonValue === "string") {
        return { perkId: jsonValue as PerkId, type: "perkUnlocked" };
      }
      break;
    case "in_time_range": {
      const range = numberPair(jsonValue);
      if (range) return { start: range[0], end: range[1], type: "time" };
      break;
    }
    case "is_season": {
      const seasons = closedStringValues(jsonValue, ALL_SEASONS);
      if (seasons) {
        if (
          ALL_SEASONS.size === seasons.length &&
          seasons.every((season) => ALL_SEASONS.has(season))
        ) {
          return { type: "always" };
        }
        return { seasons, type: "season" };
      }
      break;
    }
    case "is_weather": {
      const weathers = closedStringValues(jsonValue, ALL_WEATHERS);
      if (weathers) return { type: "weather", weathers };
      break;
    }
    case "reached_heart_level": {
      const condition = projectLevelRecord(jsonValue, "heart");
      if (condition) return condition;
      break;
    }
    case "reached_mines_level":
      if (typeof jsonValue === "number" && Number.isFinite(jsonValue)) {
        return { floor: jsonValue, type: "minesLevel" };
      }
      break;
    case "reached_skill_level": {
      const condition = projectLevelRecord(jsonValue, "skill");
      if (condition) return condition;
      break;
    }
    case "seen_cutscene":
      if (typeof jsonValue === "string") {
        const cutscene = context.cutsceneMap[jsonValue];
        if (cutscene) {
          return { questId: cutscene.questId, state: cutscene.phase, type: "quest" };
        }
      }
      break;
  }

  return {
    predicate,
    type: "gamePredicate",
    value: jsonValue,
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

function toJsonValue(
  value: unknown,
  fieldPath: string,
  sourcePath: string,
  activeObjects: Set<object>,
): JsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (Number.isFinite(value)) return value;
    throw invalidJsonValue(fieldPath, sourcePath, "non-finite number");
  }
  if (typeof value !== "object") throw invalidJsonValue(fieldPath, sourcePath, typeof value);
  if (activeObjects.has(value)) throw invalidJsonValue(fieldPath, sourcePath, "cyclic value");

  activeObjects.add(value);
  try {
    if (Array.isArray(value)) {
      validateJsonArray(value, fieldPath, sourcePath);
      return value.map((entry, index) =>
        toJsonValue(entry, `${fieldPath}[${index}]`, sourcePath, activeObjects),
      );
    }
    if (!isRecord(value)) throw invalidJsonValue(fieldPath, sourcePath, "non-record object");
    validateJsonRecord(value, fieldPath, sourcePath);

    const result: Record<string, JsonValue> = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = toJsonValue(entry, `${fieldPath}.${key}`, sourcePath, activeObjects);
    }
    return result;
  } finally {
    activeObjects.delete(value);
  }
}

function validateJsonArray(value: unknown[], fieldPath: string, sourcePath: string): void {
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw invalidJsonValue(fieldPath, sourcePath, "symbol property");
  }
  for (let index = 0; index < value.length; index++) {
    if (!Object.hasOwn(value, index)) {
      throw invalidJsonValue(`${fieldPath}[${index}]`, sourcePath, "sparse array");
    }
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    if (key !== "length" && !isArrayIndex(key, value.length)) {
      throw invalidJsonValue(fieldPath, sourcePath, "extra array property");
    }
  }
}

function validateJsonRecord(
  value: Record<string, unknown>,
  fieldPath: string,
  sourcePath: string,
): void {
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw invalidJsonValue(fieldPath, sourcePath, "symbol property");
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    if (!Object.prototype.propertyIsEnumerable.call(value, key)) {
      throw invalidJsonValue(`${fieldPath}.${key}`, sourcePath, "non-enumerable property");
    }
  }
}
