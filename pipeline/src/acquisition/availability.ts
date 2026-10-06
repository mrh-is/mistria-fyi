import { simplifyAvailabilityCondition } from "#lib/engine/availability-condition.js";
import { SEASONS, WEATHERS } from "#lib/types/tracker-data.js";
import { isNonEmptyArray } from "#lib/utils/record.js";

import type {
  AvailabilityCondition,
  JsonValue,
  PerkId,
  QuestId,
  Season,
  SkillId,
  VillagerId,
  Weather,
} from "#lib/types/tracker-data.js";
import type { NonEmptyArray } from "#lib/utils/record.js";

import type { SourceFieldLocation } from "../data-shapes.js";
import type { RequirementContext, RequirementExpression } from "../requirements.js";

const ALL_SEASONS = new Set<Season>(SEASONS);
const ALL_WEATHERS = new Set<Weather>(WEATHERS);
const STORY_CUTSCENE_QUESTS: Partial<Record<string, QuestId>> = {
  break_fire_seal: "breaking_the_fire_seal" as QuestId,
  dragon_tablet_pt_4: "breaking_the_final_seal" as QuestId,
};

export function projectRequirementExpressionToAvailability(
  expression: RequirementExpression,
  context: RequirementContext,
  sourceLocation: SourceFieldLocation,
): AvailabilityCondition {
  if ("all" in expression) {
    const conditions = expression.all.map((child) =>
      projectRequirementExpressionToAvailability(child, context, sourceLocation),
    );
    if (!isNonEmptyArray(conditions)) return { type: "always" };
    return simplifyAvailabilityCondition({ type: "all", conditions }) ?? { type: "always" };
  }
  if ("any" in expression) {
    const conditions = expression.any.map((child) =>
      projectRequirementExpressionToAvailability(child, context, sourceLocation),
    );
    if (!isNonEmptyArray(conditions)) return { type: "not", condition: { type: "always" } };
    return simplifyAvailabilityCondition({ type: "any", conditions }) ?? { type: "always" };
  }
  if ("not" in expression) {
    const condition = projectRequirementExpressionToAvailability(
      expression.not,
      context,
      sourceLocation,
    );
    return simplifyAvailabilityCondition({ type: "not", condition }) ?? { type: "always" };
  }

  return projectPredicate(expression.predicate, expression.value, context, sourceLocation);
}

function closedStringValues<T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
): NonEmptyArray<T> | undefined {
  const values = stringValues(value);
  if (
    !values ||
    values.length === 0 ||
    new Set(values).size !== values.length ||
    values.some((entry) => !allowed.has(entry as T))
  ) {
    return undefined;
  }
  return values as NonEmptyArray<T>;
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
  const prototype: unknown = Object.getPrototypeOf(value);
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
      ? { type: "heartLevel" as const, level: level as number, villagerId: id as VillagerId }
      : { type: "skillLevel" as const, level: level as number, skillId: id as SkillId },
  );
  if (!isNonEmptyArray(conditions)) return undefined;
  return simplifyAvailabilityCondition({ type: "all", conditions });
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
        return { type: "quest", questId: jsonValue as QuestId, state: "completed" };
      }
      break;
    case "has_perk":
      if (typeof jsonValue === "string") {
        return { type: "perkUnlocked", perkId: jsonValue as PerkId };
      }
      break;
    case "has_upper_floor":
      if (jsonValue === true) {
        return { type: "hasUpperFloor" };
      }
      break;
    case "in_time_range": {
      const range = numberPair(jsonValue);
      if (range) return { type: "time", start: range[0], end: range[1] };
      break;
    }
    case "is_dating_someone":
      if (jsonValue === true) {
        return { type: "isDating" };
      }
      break;
    case "is_season": {
      const seasons = closedStringValues(jsonValue, ALL_SEASONS);
      if (seasons) {
        if (
          ALL_SEASONS.size === seasons.length &&
          seasons.every((season) => ALL_SEASONS.has(season))
        ) {
          return { type: "always" };
        }
        return { type: "season", seasons };
      }
      break;
    }
    case "is_weather": {
      const weathers = closedStringValues(jsonValue, ALL_WEATHERS);
      if (weathers) return { type: "weather", weathers };
      break;
    }
    case "reached_date":
      if (typeof jsonValue === "string" && ALL_SEASONS.has(jsonValue as Season)) {
        return { type: "reachedSeason", season: jsonValue as Season };
      }
      throw new Error(
        `Day-level reached_date is not supported at ${sourceFieldPath(sourceLocation, predicate)} in ${sourceLocation.sourcePath}`,
      );

    case "reached_heart_level": {
      const condition = projectLevelRecord(jsonValue, "heart");
      if (condition) return condition;
      break;
    }
    case "reached_mines_level":
      if (typeof jsonValue === "number" && Number.isFinite(jsonValue)) {
        return { type: "mineFloor", floor: jsonValue };
      }
      break;
    case "reached_skill_level": {
      const condition = projectLevelRecord(jsonValue, "skill");
      if (condition) return condition;
      break;
    }
    case "seen_cutscene":
      if (typeof jsonValue === "string") {
        if (jsonValue === "elsie_dating_tutorial") {
          return { type: "isDating" };
        }
        const cutscene = context.cutsceneMap[jsonValue];
        if (cutscene) {
          return { type: "quest", questId: cutscene.questId, state: cutscene.phase };
        }
        const storyQuestId = STORY_CUTSCENE_QUESTS[jsonValue];
        if (storyQuestId) {
          return { type: "quest", questId: storyQuestId, state: "completed" };
        }
      }
      break;
    case "unlocked_animal":
      if (typeof jsonValue === "string") {
        return { type: "quest", questId: "repair_haydens_barn" as QuestId, state: "completed" };
      }
      break;
  }

  return {
    type: "gamePredicate",
    predicate,
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
