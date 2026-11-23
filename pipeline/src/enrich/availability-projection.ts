import { ALWAYS_VISIBLE, simplifyCondition } from "./visibility-condition.js";

import type { AvailabilityCondition } from "#lib/types/acquisition.js";
import type { VisibilityCondition } from "#lib/types/visibility.js";

export function availabilityToVisibility(condition?: AvailabilityCondition): VisibilityCondition {
  if (!condition) return ALWAYS_VISIBLE;

  switch (condition.type) {
    case "all":
    case "any":
      return simplifyCondition({
        type: condition.type === "all" ? "and" : "or",
        conditions: condition.conditions.map(availabilityToVisibility) as [
          VisibilityCondition,
          ...VisibilityCondition[],
        ],
      });
    case "always":
    case "hasUpperFloor":
    case "heartLevel":
    case "isDating":
    case "mineFloor":
    case "perkUnlocked":
    case "reachedSeason":
    case "renownLevel":
    case "skillLevel":
      return condition;
    case "dateUnlocked":
    case "gamePredicate":
    case "itemAcquired":
    case "not":
    case "season":
    case "time":
    case "weather":
      return ALWAYS_VISIBLE;
    case "quest":
      return condition.state === "completed"
        ? { type: "questCompleted", questId: condition.questId }
        : { type: "questAvailable", questId: condition.questId };
  }
}

export function toAvailableVisibility(condition: VisibilityCondition): VisibilityCondition {
  switch (condition.type) {
    case "always":
    case "biomeReached":
    case "hasUpperFloor":
    case "heartLevel":
    case "heartQuestLevel":
    case "isDating":
    case "married":
    case "mineFloor":
    case "mountVisible":
    case "perkTierReached":
    case "perkUnlocked":
    case "previousTownRank":
    case "questAvailable":
    case "questCategoryVisible":
    case "reachedSeason":
    case "recipeVisible":
    case "renownLevel":
    case "skillLevel":
    case "villagerKnown":
    case "station":
      return condition;
    case "storeUnlock":
      return { ...condition, state: "available" };
    case "and":
    case "or":
      return simplifyCondition({
        type: condition.type,
        conditions: condition.conditions.map(toAvailableVisibility) as [
          VisibilityCondition,
          ...VisibilityCondition[],
        ],
      });
    case "questCompleted":
      return { type: "questAvailable", questId: condition.questId };
  }
}
