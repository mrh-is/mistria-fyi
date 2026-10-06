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
  it("handles empty conjunctions and disjunctions without fabricating nonempty arrays", () => {
    expect(project({ all: [] })).toEqual({ type: "always" });
    expect(project({ any: [] })).toEqual({ type: "not", condition: { type: "always" } });
  });

  it("preserves mixed sibling requirements as an all condition", () => {
    expect(
      project({
        all: [
          { predicate: "has_perk", value: "steady_supplies" },
          { predicate: "is_season", value: "spring" },
        ],
      }),
    ).toEqual({
      type: "all",
      conditions: [
        { type: "perkUnlocked", perkId: "steady_supplies" },
        { type: "season", seasons: ["spring"] },
      ],
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
      type: "any",
      conditions: [
        { type: "season", seasons: ["spring"] },
        { type: "season", seasons: ["summer"] },
      ],
    });
  });

  it("preserves inverted requirements as not conditions", () => {
    expect(project({ not: { predicate: "has_perk", value: "steady_supplies" } })).toEqual({
      type: "not",
      condition: { type: "perkUnlocked", perkId: "steady_supplies" },
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
      type: "all",
      conditions: [
        { type: "weather", weathers: ["inclement", "heavy_inclement"] },
        { type: "time", start: 18, end: 26 },
      ],
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
      type: "all",
      conditions: [
        { type: "minesLevel", floor: 60 },
        { type: "perkUnlocked", perkId: "deep_delver" },
      ],
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
      type: "all",
      conditions: [
        { type: "quest", questId: "repair_the_general_store", state: "completed" },
        { type: "quest", questId: "meet_the_vendors", state: "available" },
        { type: "quest", questId: "repair_the_inn", state: "completed" },
      ],
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
      type: "all",
      conditions: [
        {
          type: "skillLevel",
          level: 20,
          skillId: "cooking",
        },
        {
          type: "skillLevel",
          level: 10,
          skillId: "fishing",
        },
        {
          type: "heartLevel",
          level: 4,
          villagerId: "celine",
        },
        {
          type: "heartLevel",
          level: 6,
          villagerId: "march",
        },
      ],
    });
  });

  it("maps reached_date with season string to reachedSeason", () => {
    expect(project({ predicate: "reached_date", value: "summer" })).toEqual({
      type: "reachedSeason",
      season: "summer",
    });
  });

  it("preserves reached_date with day granularity as an unknown gate", () => {
    expect(
      project({
        predicate: "reached_date",
        value: { day: 28, exact: true, season: "summer", year: 2 },
      }),
    ).toEqual({
      type: "gamePredicate",
      predicate: "reached_date",
      value: { day: 28, exact: true, season: "summer", year: 2 },
    });
  });

  it("maps has_upper_floor to hasUpperFloor", () => {
    expect(project({ predicate: "has_upper_floor", value: true })).toEqual({
      type: "hasUpperFloor",
    });
  });

  it("maps is_dating_someone to isDating", () => {
    expect(project({ predicate: "is_dating_someone", value: true })).toEqual({
      type: "isDating",
    });
  });

  it("maps unlocked_animal to repair_haydens_barn quest", () => {
    expect(project({ predicate: "unlocked_animal", value: "duck" })).toEqual({
      type: "quest",
      questId: "repair_haydens_barn",
      state: "completed",
    });
  });

  it("maps seen_cutscene elsie_dating_tutorial to isDating", () => {
    expect(project({ predicate: "seen_cutscene", value: "elsie_dating_tutorial" })).toEqual({
      type: "isDating",
    });
  });

  it.each([
    ["break_fire_seal", "breaking_the_fire_seal"],
    ["dragon_tablet_pt_4", "breaking_the_final_seal"],
  ])("maps story cutscene %s to completed quest %s", (cutsceneId, questId) => {
    expect(project({ predicate: "seen_cutscene", value: cutsceneId })).toEqual({
      type: "quest",
      questId,
      state: "completed",
    });
  });

  it("preserves unknown nested predicates as JSON-safe game predicates", () => {
    expect(
      project({
        predicate: "future_gate",
        value: { alternatives: [{ flags: ["alpha", false] }], minimum: 3 },
      }),
    ).toEqual({
      type: "gamePredicate",
      predicate: "future_gate",
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

  it("includes nested field and source-file provenance in JSON diagnostics", () => {
    expect(() =>
      project({
        predicate: "future_gate",
        value: { nested: [undefined] },
      }),
    ).toThrow("town_store/copper_sword.requirements.future_gate.nested[0] in stores.toml");
  });

  it.each(["reached_skill_level", "reached_heart_level"])(
    "preserves null %s payloads and diagnoses undefined payloads",
    (predicate) => {
      expect(project({ predicate, value: null })).toEqual({
        type: "gamePredicate",
        predicate,
        value: null,
      });
      expect(() => project({ predicate, value: undefined })).toThrow(
        `town_store/copper_sword.requirements.${predicate} in stores.toml`,
      );
    },
  );

  it.each([
    ["is_season", ["spring", "spring", "summer", "fall"]],
    ["is_season", ["spring", "monsoon"]],
    ["is_weather", ["inclement", "sandstorm"]],
  ])("preserves invalid or non-unique %s members as game predicates", (predicate, value) => {
    expect(project({ predicate, value })).toEqual({
      type: "gamePredicate",
      predicate,
      value,
    });
  });

  it("rejects non-JSON array and record structures without discarding their data", () => {
    // oxlint-disable-next-line unicorn/no-new-array -- the test needs a sparse array
    const sparse: unknown[] = new Array(1);
    const symbolArray: unknown[] = ["calm"];
    Object.defineProperty(symbolArray, Symbol("weather"), { enumerable: true, value: true });
    const extraArray: unknown[] = ["calm"];
    Object.defineProperty(extraArray, "label", { enumerable: true, value: "market" });
    const symbolLevelRecord: Record<string, unknown> = { cooking: 20 };
    Object.defineProperty(symbolLevelRecord, Symbol("level"), { enumerable: true, value: true });
    const extraRange: unknown[] = [18, 26];
    Object.defineProperty(extraRange, "label", { enumerable: true, value: "market" });

    expect(() => project({ predicate: "future_gate", value: sparse })).toThrow(
      "town_store/copper_sword.requirements.future_gate[0] in stores.toml",
    );
    expect(() => project({ predicate: "future_gate", value: symbolArray })).toThrow(
      "town_store/copper_sword.requirements.future_gate in stores.toml",
    );
    expect(() => project({ predicate: "future_gate", value: extraArray })).toThrow(
      "town_store/copper_sword.requirements.future_gate in stores.toml",
    );
    expect(() => project({ predicate: "reached_skill_level", value: symbolLevelRecord })).toThrow(
      "town_store/copper_sword.requirements.reached_skill_level in stores.toml",
    );
    expect(() => project({ predicate: "in_time_range", value: extraRange })).toThrow(
      "town_store/copper_sword.requirements.in_time_range in stores.toml",
    );
  });
});
