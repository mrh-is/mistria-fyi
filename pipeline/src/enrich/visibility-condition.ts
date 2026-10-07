import type { VisibilityCondition } from "#lib/types/visibility.js";

/** The unconditional visibility, shared so every module emits the same shape. */
export const ALWAYS_VISIBLE: VisibilityCondition = Object.freeze({ type: "always" });

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
