import { simplifyAvailabilityCondition } from "#lib/engine/availability-condition.js";
import { SEASONS, WEATHERS } from "#lib/types/tracker-data.js";
import { isNonEmptyArray } from "#lib/utils/record.js";

import { ALWAYS_VISIBLE, simplifyCondition } from "../enrich/visibility-condition.js";
import { CUTSCENE_QUESTS } from "../overrides/game-facts.js";

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
import type { VisibilityCondition } from "#lib/types/visibility.js";
import type { NonEmptyArray } from "#lib/utils/record.js";

import type { SourceFieldLocation } from "../data-shapes.js";
import type { CutsceneQuestMap } from "../extract/cutscene-quest-map.js";
import type { RequirementContext, RequirementExpression } from "../parse/requirements.js";

const ALL_SEASONS = new Set<Season>(SEASONS);
const ALL_WEATHERS = new Set<Weather>(WEATHERS);

const NON_SPOILER_PREDICATES = new Set([
  "acquired_item",
  "has_upper_floor",
  "is_day_type",
  "is_season",
  "reached_date",
]);

export interface RequirementProjection {
  availability: AvailabilityCondition;
  spoilerVisibility: VisibilityCondition;
}

/** One native-tree traversal, with independent acquisition & spoiler policies at each leaf. */
export function projectRequirements(
  expression: RequirementExpression,
  context: RequirementContext,
  sourceLocation: SourceFieldLocation,
): RequirementProjection {
  if ("all" in expression || "any" in expression) {
    const all = "all" in expression;
    const children = ("all" in expression ? expression.all : expression.any).map((child) =>
      projectRequirements(child, context, sourceLocation),
    );
    const availabilityConditions = children.map((child) => child.availability);
    let availability: AvailabilityCondition = all
      ? { type: "always" }
      : { type: "not", condition: { type: "always" } };
    if (isNonEmptyArray(availabilityConditions)) {
      availability = simplifyAvailabilityCondition({
        type: all ? "all" : "any",
        conditions: availabilityConditions,
      }) ?? { type: "always" };
    }
    return {
      availability,
      spoilerVisibility: simplifyCondition({
        type: all ? "and" : "or",
        conditions: children.map((child) => child.spoilerVisibility) as [
          VisibilityCondition,
          ...VisibilityCondition[],
        ],
      }),
    };
  }
  if ("not" in expression) {
    const child = projectRequirements(expression.not, context, sourceLocation);
    return {
      availability: simplifyAvailabilityCondition({
        type: "not",
        condition: child.availability,
      }) ?? { type: "always" },
      spoilerVisibility: ALWAYS_VISIBLE,
    };
  }
  return {
    availability: projectPredicate(expression.predicate, expression.value, context, sourceLocation),
    spoilerVisibility: projectSpoilerPredicate(expression, context.cutsceneMap),
  };
}

export function projectRequirementExpressionToAvailability(
  expression: RequirementExpression,
  context: RequirementContext,
  sourceLocation: SourceFieldLocation,
): AvailabilityCondition {
  return projectRequirements(expression, context, sourceLocation).availability;
}

export function resolveToVisibility(
  expression: RequirementExpression,
  cutsceneMap: CutsceneQuestMap,
): VisibilityCondition {
  return projectRequirements(
    expression,
    { cutsceneMap, namedRequirements: {}, primitivePredicates: new Set() },
    { fieldPath: "requirements", sourcePath: "native requirements" },
  ).spoilerVisibility;
}

function projectSpoilerPredicate(
  expression: Extract<RequirementExpression, { predicate: string }>,
  cutsceneMap: CutsceneQuestMap,
): VisibilityCondition {
  // Predicate leaf
  const { predicate, value } = expression;

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
      // The UI cannot evaluate calendar days yet; preserve the native predicate as an unknown
      // gate so a day-level restriction is never represented as unconditional stock.
      return { type: "gamePredicate", predicate, value: jsonValue };

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
        const cutscene = context.cutsceneMap[jsonValue] ?? CUTSCENE_QUESTS[jsonValue];
        if (cutscene) {
          return { type: "quest", questId: cutscene.questId, state: cutscene.phase };
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
