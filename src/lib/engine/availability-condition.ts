import { seasonOrdinal } from "#lib/engine/domain-primitives.js";

import type {
  AvailabilityCondition,
  PerkId,
  QuestId,
  Season,
  SkillId,
  VillagerId,
  Weather,
} from "#lib/types/tracker-data.js";
import type { QuestVisibility } from "#lib/types/visibility.js";
import type { NonEmptyArray } from "#lib/utils/record.js";

/** Each omitted fact, & each key a lookup doesn't answer, evaluates as "unknown". */
export interface AvailabilityContext {
  hasUpperFloor?: boolean;
  heartLevels?: Lookup<VillagerId, number>;
  isDating?: boolean;
  mineFloor?: number;
  questStates?: Lookup<QuestId, QuestVisibility>;
  /** The latest season the player has reached. */
  reachedSeason?: Season;
  season?: Season;
  skillLevels?: Lookup<SkillId, number>;
  time?: number;
  unlockedPerks?: ReadonlySet<PerkId>;
  weather?: Weather;
}

export type AvailabilityValue = "unknown" | boolean;

export interface DisplayBadges {
  seasons?: Season[];
  timeRange?: [number, number];
  weathers?: Weather[];
}

export function evaluateAvailabilityCondition(
  condition: AvailabilityCondition | undefined,
  context: AvailabilityContext,
): AvailabilityValue {
  if (!condition) return true;
  switch (condition.type) {
    case "all":
      return evaluateAll(condition.conditions, context);
    case "always":
      return true;
    case "any":
      return evaluateAny(condition.conditions, context);
    case "dateUnlocked":
    case "gamePredicate":
      return "unknown";
    case "hasUpperFloor":
      return context.hasUpperFloor ?? "unknown";
    case "heartLevel": {
      const level = context.heartLevels?.get(condition.villagerId);
      return level === undefined ? "unknown" : level >= condition.level;
    }
    case "isDating":
      return context.isDating ?? "unknown";
    case "mineFloor":
      return context.mineFloor === undefined ? "unknown" : context.mineFloor >= condition.floor;
    case "not": {
      const value = evaluateAvailabilityCondition(condition.condition, context);
      return value === "unknown" ? "unknown" : !value;
    }
    case "perkUnlocked":
      return context.unlockedPerks === undefined
        ? "unknown"
        : context.unlockedPerks.has(condition.perkId);
    case "quest": {
      const state = context.questStates?.get(condition.questId);
      return state === undefined ? "unknown" : state === condition.state;
    }
    case "reachedSeason":
      return context.reachedSeason === undefined
        ? "unknown"
        : seasonOrdinal(context.reachedSeason) >= seasonOrdinal(condition.season);
    case "season":
      return context.season === undefined ? "unknown" : condition.seasons.includes(context.season);
    case "skillLevel": {
      const level = context.skillLevels?.get(condition.skillId);
      return level === undefined ? "unknown" : level >= condition.level;
    }
    case "time":
      return context.time === undefined
        ? "unknown"
        : timeMatches(condition.start, condition.end, context.time);
    case "weather":
      return context.weather === undefined
        ? "unknown"
        : condition.weathers.includes(context.weather);
  }
}

export function extractDisplayBadges(condition: AvailabilityCondition): DisplayBadges {
  const badges: DisplayBadges = {};
  collectBadges(condition, badges);
  return badges;
}

export function hasSelectiveSeasonCondition(condition: AvailabilityCondition): boolean {
  return hasSelectiveSeasonConditionInSimplified(simplifyAvailabilityCondition(condition));
}

export function simplifyAvailabilityCondition(
  condition: AvailabilityCondition,
): AvailabilityCondition | undefined {
  switch (condition.type) {
    case "all": {
      const conditions = condition.conditions.flatMap((child) => {
        const simplified = simplifyAvailabilityCondition(child);
        if (!simplified) return [];
        return simplified.type === "all" ? simplified.conditions : [simplified];
      });
      const withoutAlways = conditions.filter((child) => child.type !== "always");
      if (withoutAlways.length === 0) return undefined;
      if (withoutAlways.length === 1) return withoutAlways[0];
      return { type: "all", conditions: withoutAlways as NonEmptyArray<AvailabilityCondition> };
    }
    case "always":
    case "dateUnlocked":
    case "gamePredicate":
    case "hasUpperFloor":
    case "heartLevel":
    case "isDating":
    case "mineFloor":
    case "perkUnlocked":
    case "quest":
    case "reachedSeason":
    case "skillLevel":
    case "time":
    case "weather":
      return condition;
    case "any": {
      const conditions = condition.conditions.flatMap((child) => {
        const simplified = simplifyAvailabilityCondition(child);
        if (!simplified) return [];
        return simplified.type === "any" ? simplified.conditions : [simplified];
      });
      if (conditions.some((child) => child.type === "always") || conditions.length === 0) {
        return undefined;
      }
      if (conditions.length === 1) return conditions[0];
      return { type: "any", conditions: conditions as NonEmptyArray<AvailabilityCondition> };
    }
    case "not": {
      const simplified = simplifyAvailabilityCondition(condition.condition);
      // Negating an unrestricted condition means "never", which must not collapse to unrestricted.
      if (!simplified) return { type: "not", condition: { type: "always" } };
      return simplified.type === "not"
        ? simplified.condition
        : { type: "not", condition: simplified };
    }
    case "season":
      return condition;
  }
}

function collectBadges(condition: AvailabilityCondition, badges: DisplayBadges): void {
  switch (condition.type) {
    case "all":
    case "any":
      for (const child of condition.conditions) {
        collectBadges(child, badges);
      }
      break;
    case "always":
    case "dateUnlocked":
    case "gamePredicate":
    case "hasUpperFloor":
    case "heartLevel":
    case "isDating":
    case "mineFloor":
    case "perkUnlocked":
    case "quest":
    case "reachedSeason":
    case "skillLevel":
      break;
    case "not":
      collectBadges(condition.condition, badges);
      break;
    case "season":
      badges.seasons ??= condition.seasons;
      break;
    case "time":
      badges.timeRange ??= [condition.start, condition.end];
      break;
    case "weather":
      badges.weathers ??= condition.weathers;
      break;
  }
}

function evaluateAll(
  conditions: AvailabilityCondition[],
  context: AvailabilityContext,
): AvailabilityValue {
  let hasUnknown = false;
  for (const condition of conditions) {
    const value = evaluateAvailabilityCondition(condition, context);
    if (value === false) return false;
    if (value === "unknown") hasUnknown = true;
  }
  return hasUnknown ? "unknown" : true;
}

function evaluateAny(
  conditions: AvailabilityCondition[],
  context: AvailabilityContext,
): AvailabilityValue {
  let hasUnknown = false;
  for (const condition of conditions) {
    const value = evaluateAvailabilityCondition(condition, context);
    if (value === true) return true;
    if (value === "unknown") hasUnknown = true;
  }
  return hasUnknown ? "unknown" : false;
}

function hasSelectiveSeasonConditionInSimplified(condition?: AvailabilityCondition): boolean {
  switch (condition?.type) {
    case "all":
    case "any":
      return condition.conditions.some(hasSelectiveSeasonConditionInSimplified);
    case "always":
    case "dateUnlocked":
    case "gamePredicate":
    case "hasUpperFloor":
    case "heartLevel":
    case "isDating":
    case "mineFloor":
    case "perkUnlocked":
    case "quest":
    case "reachedSeason":
    case "skillLevel":
    case "time":
    case undefined:
    case "weather":
      return false;
    case "not":
      return hasSelectiveSeasonConditionInSimplified(condition.condition);
    case "season":
      return !(["spring", "summer", "fall", "winter"] as Season[]).every((season) =>
        condition.seasons.includes(season),
      );
  }
}

/** A keyed fact source; a `ReadonlyMap` is one, & so is a defaulting adapter over a record. */
interface Lookup<Key, Value> {
  get: (key: Key) => undefined | Value;
}

function timeMatches(start: number, end: number, time: number): boolean {
  return start <= end ? time >= start && time <= end : time >= start || time <= end;
}
