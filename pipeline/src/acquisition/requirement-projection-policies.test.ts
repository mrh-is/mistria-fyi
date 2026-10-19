import { describe, expect, it } from "vitest";

import { createRequirementContext } from "../parse/requirements.js";
import { projectRequirements } from "./requirement-projector.js";

import type { RequirementExpression } from "../parse/requirements.js";

const context = createRequirementContext({});
const location = { fieldPath: "requirements", sourcePath: "fixture.toml" };
const project = (expression: RequirementExpression) =>
  projectRequirements(expression, context, location);

describe("native projection policies", () => {
  it("preserves acquisition restrictions that do not conceal spoilers", () => {
    for (const [predicate, value, type] of [
      ["has_upper_floor", true, "hasUpperFloor"],
      ["reached_date", "spring", "reachedSeason"],
      ["has_perk", "taste_maker", "perkUnlocked"],
      ["is_dating_someone", true, "isDating"],
      ["unlocked_animal", "cow", "quest"],
      ["seen_cutscene", "elsie_dating_tutorial", "isDating"],
      ["seen_cutscene", "destroy_vines_eastern_road", "quest"],
    ] as const) {
      const projected = project({ predicate, value });
      expect(projected.availability.type).toBe(type);
      expect(projected.spoilerVisibility).toEqual({ type: "always" });
    }
  });

  it("keeps villager discovery solely in spoiler visibility", () => {
    expect(project({ predicate: "met_villager", value: "juniper" })).toEqual({
      availability: { type: "gamePredicate", predicate: "met_villager", value: "juniper" },
      spoilerVisibility: { type: "villagerKnown", villagerId: "juniper" },
    });
  });

  it("keeps empty disjunctions impossible for stock & unconcealed for spoilers", () => {
    expect(project({ any: [] })).toEqual({
      availability: { type: "not", condition: { type: "always" } },
      spoilerVisibility: { type: "always" },
    });
  });

  it("retains negation for acquisition while ignoring it for spoilers", () => {
    expect(project({ not: { predicate: "completed_quest", value: "repair_the_bridge" } })).toEqual({
      availability: {
        type: "not",
        condition: { type: "quest", questId: "repair_the_bridge", state: "completed" },
      },
      spoilerVisibility: { type: "always" },
    });
  });
});
