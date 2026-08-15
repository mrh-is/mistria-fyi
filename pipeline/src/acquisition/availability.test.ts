import { describe, expect, it } from "vitest";

import { projectRequirementExpressionToAvailability } from "./availability.js";

import type { RequirementContext, RequirementExpression } from "../requirements.js";

const context: RequirementContext = {
  cutsceneMap: {
    available_scene: { phase: "available", questId: "meet_the_vendors" as never },
    completed_scene: { phase: "completed", questId: "repair_the_inn" as never },
  },
  namedRequirements: {},
  primitivePredicates: new Set(),
};

const sourceLocation = {
  entityId: "town_store/copper_sword",
  fieldPath: "requirements",
  sourcePath: "stores.toml",
};

function project(expression: RequirementExpression) {
  return projectRequirementExpressionToAvailability(expression, context, sourceLocation);
}

describe("projectRequirementExpressionToAvailability", () => {
  it("preserves mixed sibling requirements as an all condition", () => {
    expect(
      project({
        all: [
          { predicate: "has_perk", value: "steady_supplies" },
          { predicate: "is_season", value: "spring" },
        ],
      }),
    ).toEqual({
      conditions: [
        { perkId: "steady_supplies", type: "perkUnlocked" },
        { seasons: ["spring"], type: "season" },
      ],
      type: "all",
    });
  });

  it("preserves or branches as any conditions", () => {
    expect(
      project({
        any: [
          { predicate: "is_season", value: "spring" },
          { predicate: "is_season", value: "summer" },
        ],
      }),
    ).toEqual({
      conditions: [
        { seasons: ["spring"], type: "season" },
        { seasons: ["summer"], type: "season" },
      ],
      type: "any",
    });
  });

  it("preserves inverted requirements as not conditions", () => {
    expect(project({ not: { predicate: "has_perk", value: "steady_supplies" } })).toEqual({
      condition: { perkId: "steady_supplies", type: "perkUnlocked" },
      type: "not",
    });
  });

  it("simplifies a four-season requirement to always", () => {
    expect(
      project({
        predicate: "is_season",
        value: ["spring", "summer", "fall", "winter"],
      }),
    ).toEqual({ type: "always" });
  });

  it("maps weather and time predicates to typed leaves", () => {
    expect(
      project({
        all: [
          { predicate: "is_weather", value: ["inclement", "heavy_inclement"] },
          { predicate: "in_time_range", value: [18, 26] },
        ],
      }),
    ).toEqual({
      conditions: [
        { type: "weather", weathers: ["inclement", "heavy_inclement"] },
        { start: 18, end: 26, type: "time" },
      ],
      type: "all",
    });
  });

  it("maps mine floor and perk predicates to typed leaves", () => {
    expect(
      project({
        all: [
          { predicate: "reached_mines_level", value: 60 },
          { predicate: "has_perk", value: "deep_delver" },
        ],
      }),
    ).toEqual({
      conditions: [
        { floor: 60, type: "minesLevel" },
        { perkId: "deep_delver", type: "perkUnlocked" },
      ],
      type: "all",
    });
  });

  it("maps completed quests and cutscene phases to quest conditions", () => {
    expect(
      project({
        all: [
          { predicate: "completed_quest", value: "repair_the_general_store" },
          { predicate: "seen_cutscene", value: "available_scene" },
          { predicate: "seen_cutscene", value: "completed_scene" },
        ],
      }),
    ).toEqual({
      conditions: [
        { questId: "repair_the_general_store", state: "completed", type: "quest" },
        { questId: "meet_the_vendors", state: "available", type: "quest" },
        { questId: "repair_the_inn", state: "completed", type: "quest" },
      ],
      type: "all",
    });
  });

  it("maps skill and heart-level records as conjunctions", () => {
    expect(
      project({
        all: [
          { predicate: "reached_skill_level", value: { cooking: 20, fishing: 10 } },
          { predicate: "reached_heart_level", value: { celine: 4, march: 6 } },
        ],
      }),
    ).toEqual({
      conditions: [
        {
          level: 20,
          skillId: "cooking",
          type: "skillLevel",
        },
        {
          level: 10,
          skillId: "fishing",
          type: "skillLevel",
        },
        {
          level: 4,
          npcId: "celine",
          type: "heartLevel",
        },
        {
          level: 6,
          npcId: "march",
          type: "heartLevel",
        },
      ],
      type: "all",
    });
  });

  it("preserves reached dates without truncating their payload", () => {
    expect(
      project({
        predicate: "reached_date",
        value: { day: 28, exact: true, season: "summer", year: 2 },
      }),
    ).toEqual({
      predicate: "reached_date",
      type: "gamePredicate",
      value: { day: 28, exact: true, season: "summer", year: 2 },
    });
  });

  it("preserves unknown nested predicates as JSON-safe game predicates", () => {
    expect(
      project({
        predicate: "future_gate",
        value: { alternatives: [{ flags: ["alpha", false] }], minimum: 3 },
      }),
    ).toEqual({
      predicate: "future_gate",
      type: "gamePredicate",
      value: { alternatives: [{ flags: ["alpha", false] }], minimum: 3 },
    });
  });

  it("rejects invalid game-predicate values with source field-path provenance", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    for (const value of [
      undefined,
      () => undefined,
      Symbol("gate"),
      Number.POSITIVE_INFINITY,
      cyclic,
    ]) {
      expect(() => project({ predicate: "future_gate", value })).toThrow(
        "town_store/copper_sword.requirements.future_gate",
      );
    }
  });
});
