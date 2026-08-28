import { simplifyCondition } from "./requirement-resolver.js";

import type { AvailabilityCondition } from "$lib/types/acquisition.js";
import type { VisibilityCondition } from "$lib/types/visibility.js";

const ALWAYS: VisibilityCondition = { type: "always" };

export function availabilityToVisibility(condition?: AvailabilityCondition): VisibilityCondition {
  if (!condition) return ALWAYS;

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
    case "heartLevel":
    case "minesLevel":
    case "perkUnlocked":
    case "skillLevel":
      return condition;
    case "gamePredicate":
    case "not":
    case "season":
    case "time":
    case "weather":
      return ALWAYS;
    case "quest":
      return condition.state === "completed"
        ? { type: "questCompleted", questId: condition.questId }
        : { type: "questAvailable", questId: condition.questId };
  }
}

export function toAvailableVisibility(condition: VisibilityCondition): VisibilityCondition {
  switch (condition.type) {
    case "always":
    case "heartLevel":
    case "married":
    case "minesLevel":
    case "npcKnown":
    case "perkUnlocked":
    case "questAvailable":
    case "renownLevel":
    case "skillLevel":
      return condition;
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
