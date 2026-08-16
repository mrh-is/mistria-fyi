import type {
  AvailabilityCondition,
  NpcId,
  PerkId,
  QuestId,
  Season,
  SkillId,
  Weather,
} from "$lib/types/tracker-data.js";

export interface AvailabilityContext {
  heartLevels?: ReadonlyMap<NpcId, number>;
  minesLevel?: number;
  perkIds?: ReadonlySet<PerkId>;
  questStates?: ReadonlyMap<QuestId, "available" | "completed">;
  season?: Season;
  skillLevels?: ReadonlyMap<SkillId, number>;
  time?: number;
  weather?: Weather;
}

export type AvailabilityValue = "unknown" | boolean;

const ALL_SEASONS: readonly Season[] = ["spring", "summer", "fall", "winter"];

export function evaluateAvailabilityCondition(
  condition: AvailabilityCondition,
  context: AvailabilityContext,
): AvailabilityValue {
  switch (condition.type) {
    case "all":
      return evaluateAll(condition.conditions, context);
    case "always":
      return true;
    case "any":
      return evaluateAny(condition.conditions, context);
    case "gamePredicate":
      return "unknown";
    case "heartLevel": {
      const level = context.heartLevels?.get(condition.npcId);
      return level === undefined ? "unknown" : level >= condition.level;
    }
    case "minesLevel":
      return context.minesLevel === undefined ? "unknown" : context.minesLevel >= condition.floor;
    case "not": {
      const value = evaluateAvailabilityCondition(condition.condition, context);
      return value === "unknown" ? "unknown" : !value;
    }
    case "perkUnlocked":
      return context.perkIds === undefined ? "unknown" : context.perkIds.has(condition.perkId);
    case "quest": {
      const state = context.questStates?.get(condition.questId);
      return state === undefined ? "unknown" : state === condition.state;
    }
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

export function hasSelectiveSeasonCondition(condition: AvailabilityCondition): boolean {
  return hasSelectiveSeasonConditionInSimplified(simplifyAvailabilityCondition(condition));
}

export function simplifyAvailabilityCondition(
  condition: AvailabilityCondition,
): AvailabilityCondition {
  switch (condition.type) {
    case "all": {
      const conditions = condition.conditions.flatMap((child) => {
        const simplified = simplifyAvailabilityCondition(child);
        return simplified.type === "all" ? simplified.conditions : [simplified];
      });
      const withoutAlways = conditions.filter((child) => child.type !== "always");
      if (withoutAlways.length === 0) return { type: "always" };
      if (withoutAlways.length === 1) return withoutAlways[0];
      return { conditions: withoutAlways, type: "all" };
    }
    case "always":
    case "gamePredicate":
    case "heartLevel":
    case "minesLevel":
    case "perkUnlocked":
    case "quest":
    case "skillLevel":
    case "time":
    case "weather":
      return condition;
    case "any": {
      const conditions = condition.conditions.flatMap((child) => {
        const simplified = simplifyAvailabilityCondition(child);
        return simplified.type === "any" ? simplified.conditions : [simplified];
      });
      if (conditions.some((child) => child.type === "always")) return { type: "always" };
      if (conditions.length === 1) return conditions[0];
      return { conditions, type: "any" };
    }
    case "not": {
      const simplified = simplifyAvailabilityCondition(condition.condition);
      return simplified.type === "not"
        ? simplified.condition
        : { condition: simplified, type: "not" };
    }
    case "season":
      return condition;
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

function hasSelectiveSeasonConditionInSimplified(condition: AvailabilityCondition): boolean {
  switch (condition.type) {
    case "all":
    case "any":
      return condition.conditions.some(hasSelectiveSeasonConditionInSimplified);
    case "always":
    case "gamePredicate":
    case "heartLevel":
    case "minesLevel":
    case "perkUnlocked":
    case "quest":
    case "skillLevel":
    case "time":
    case "weather":
      return false;
    case "not":
      return hasSelectiveSeasonConditionInSimplified(condition.condition);
    case "season":
      return !ALL_SEASONS.every((season) => condition.seasons.includes(season));
  }
}

function timeMatches(start: number, end: number, time: number): boolean {
  return start <= end ? time >= start && time <= end : time >= start || time <= end;
}
