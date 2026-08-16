import { describe, expect, it } from "vitest";

import { parseFiddle } from "./parse-fiddle.js";
import {
  buildRequirementDefinitions,
  createRequirementContext,
  type NamedRequirementDefinitions,
  parseRequirements,
  type RequirementExpression,
} from "./requirements.js";

import type { SourceFieldLocation } from "./data-shapes.js";

const testSourceLocation: SourceFieldLocation = {
  entityId: "test_item",
  fieldPath: "requirements",
  sourcePath: "test.toml",
};

function makeRequirementDefinitions(
  namedRequirements: NamedRequirementDefinitions,
  extraPrimitives: string[] = [],
) {
  const primitivePredicates = new Set([
    "has_perk",
    "has_upper_floor",
    "is_best_friend",
    "is_dating_someone",
    "is_partner",
    "is_season",
    "met_npc",
    "reached_date",
    "reached_heart_level",
    "reached_mines_level",
    "reached_skill_level",
    "scene_is_playing",
    "seen_cutscene",
    "unlocked_animal",
    ...extraPrimitives,
  ]);
  return { namedRequirements, primitivePredicates };
}

describe("parseRequirements", () => {
  it("resolves a primitive predicate", () => {
    const { namedRequirements, primitivePredicates } = makeRequirementDefinitions({});
    const result = parseRequirements(
      { reached_skill_level: { ranching: 20 } },
      namedRequirements,
      primitivePredicates,
      testSourceLocation,
    );
    expect(result).toEqual({ predicate: "reached_skill_level", value: { ranching: 20 } });
  });

  it("resolves a named requirement to its primitive", () => {
    const { namedRequirements, primitivePredicates } = makeRequirementDefinitions({
      repaired_general_store: { seen_cutscene: "repair_the_general_store_pt_2" },
    });
    const result = parseRequirements(
      { repaired_general_store: true },
      namedRequirements,
      primitivePredicates,
      testSourceLocation,
    );
    expect(result).toEqual({
      predicate: "seen_cutscene",
      value: "repair_the_general_store_pt_2",
    });
  });

  it("resolves nested named requirements", () => {
    const { namedRequirements, primitivePredicates } = makeRequirementDefinitions({
      broke_bell: {
        invert: {
          or: [{ repaired_bell_tower: true }, { repaired_bell_tower_door: true }],
        },
        seen_cutscene: "repair_the_bell_tower_pt_1",
      },
      repaired_bell_tower: { seen_cutscene: "repair_the_bell_tower_pt_2" },
      repaired_bell_tower_door: { seen_cutscene: "repair_the_bell_tower_pt_2" },
    });

    const result = parseRequirements(
      { broke_bell: true },
      namedRequirements,
      primitivePredicates,
      testSourceLocation,
    );

    expect(result).toHaveProperty("all");
    const all = (result as { all: RequirementExpression[] }).all;
    expect(all).toHaveLength(2);
    const predicateEntry = all.find((e) => "predicate" in e);
    const notEntry = all.find((e) => "not" in e);
    expect(predicateEntry).toEqual({
      predicate: "seen_cutscene",
      value: "repair_the_bell_tower_pt_1",
    });
    expect(notEntry).toHaveProperty("not");
    const notExpr = (notEntry as { not: RequirementExpression }).not;
    expect(notExpr).toHaveProperty("any");
  });

  it("detects cycles", () => {
    const { namedRequirements, primitivePredicates } = makeRequirementDefinitions({
      cycle_a: { cycle_b: true },
      cycle_b: { cycle_a: true },
    });
    expect(() =>
      parseRequirements(
        { cycle_a: true },
        namedRequirements,
        primitivePredicates,
        testSourceLocation,
      ),
    ).toThrow(/cycle_a -> cycle_b -> cycle_a/);
  });

  it("preserves unknown keys as predicate leaves", () => {
    const { namedRequirements, primitivePredicates } = makeRequirementDefinitions({});
    // unknown_requirement is neither primitive nor named
    const result = parseRequirements(
      { unknown_requirement: true },
      namedRequirements,
      primitivePredicates,
      testSourceLocation,
    );
    // Unknown keys are treated as predicates (not errors) since we can't distinguish
    // all possible future predicate keys from typos at parse time
    expect(result).toEqual({ predicate: "unknown_requirement", value: true });
  });

  it("handles multiple sibling keys as implicit all", () => {
    const { namedRequirements, primitivePredicates } = makeRequirementDefinitions({});
    const result = parseRequirements(
      { has_perk: "steady_supplies", is_season: "spring" },
      namedRequirements,
      primitivePredicates,
      testSourceLocation,
    );
    expect(result).toEqual({
      all: [
        { predicate: "has_perk", value: "steady_supplies" },
        { predicate: "is_season", value: "spring" },
      ],
    });
  });

  it("handles or with array of alternatives", () => {
    const { namedRequirements, primitivePredicates } = makeRequirementDefinitions({});
    const result = parseRequirements(
      { or: [{ is_season: "spring" }, { is_season: "summer" }] },
      namedRequirements,
      primitivePredicates,
      testSourceLocation,
    );
    expect(result).toEqual({
      any: [
        { predicate: "is_season", value: "spring" },
        { predicate: "is_season", value: "summer" },
      ],
    });
  });

  it("resolves the real broke_bell definition from requirements.toml", () => {
    const { namedRequirements, primitivePredicates } = makeRequirementDefinitions({
      broke_bell: {
        invert: {
          or: [{ repaired_bell_tower: true }, { repaired_bell_tower_door: true }],
        },
        seen_cutscene: "repair_the_bell_tower_pt_1",
      },
      repaired_bell_tower: { seen_cutscene: "repair_the_bell_tower_pt_2" },
      repaired_bell_tower_door: { seen_cutscene: "repair_the_bell_tower_pt_2" },
    });

    const result = parseRequirements(
      { broke_bell: true },
      namedRequirements,
      primitivePredicates,
      testSourceLocation,
    );

    // Should be: all(seen_cutscene, not(any(seen_cutscene, seen_cutscene)))
    expect(result).toHaveProperty("all");
    const all = (result as { all: RequirementExpression[] }).all;
    expect(all).toHaveLength(2);
  });
});

describe("buildRequirementDefinitions", () => {
  it("separates primitives from named requirements", () => {
    const data: Record<string, unknown> = {
      has_perk: {},
      is_season: {},
      repaired_general_store: { seen_cutscene: "repair_the_general_store_pt_2" },
      seen_cutscene: {},
    };
    const { namedRequirements, primitivePredicates } = buildRequirementDefinitions(data);
    expect(primitivePredicates.has("has_perk")).toBe(true);
    expect(primitivePredicates.has("is_season")).toBe(true);
    expect(primitivePredicates.has("seen_cutscene")).toBe(true);
    expect(primitivePredicates.has("repaired_general_store")).toBe(false);
    expect(namedRequirements.repaired_general_store).toEqual({
      seen_cutscene: "repair_the_general_store_pt_2",
    });
  });

  it("parses the full requirements.toml fixture", () => {
    const parsed = parseFiddle("pipeline/input/assets");
    const requirementsData = parsed.data.requirements as Record<string, unknown>;
    expect(requirementsData).toBeDefined();

    const { namedRequirements, primitivePredicates } =
      buildRequirementDefinitions(requirementsData);
    expect(primitivePredicates.size).toBeGreaterThan(30);
    expect(Object.keys(namedRequirements).length).toBeGreaterThan(20);

    // Verify repaired_general_store resolves
    const result = parseRequirements(
      { repaired_general_store: true },
      namedRequirements,
      primitivePredicates,
      { entityId: "test", fieldPath: "requirements", sourcePath: "stores.toml" },
    );
    expect(result).toEqual({
      predicate: "seen_cutscene",
      value: "repair_the_general_store_pt_2",
    });
  });
});

describe("createRequirementContext", () => {
  it("combines parsed requirement definitions with the supplied cutscene map", () => {
    const context = createRequirementContext(
      { has_perk: {}, repaired_general_store: { seen_cutscene: "repair_general_store" } },
      {
        repair_general_store: {
          phase: "completed",
          questId: "repair_the_general_store" as never,
        },
      },
    );

    expect(context.primitivePredicates).toEqual(new Set(["has_perk"]));
    expect(context.namedRequirements).toEqual({
      repaired_general_store: { seen_cutscene: "repair_general_store" },
    });
    expect(context.cutsceneMap).toEqual({
      repair_general_store: {
        phase: "completed",
        questId: "repair_the_general_store",
      },
    });
  });
});
