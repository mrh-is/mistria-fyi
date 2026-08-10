import { describe, expect, it } from "vitest";

import type { DataContext } from "./data-shapes.js";
import { parseFiddle } from "./parse-fiddle.js";

import {
  buildRequirementRegistry,
  parseRequirements,
  type RequirementExpr,
  type RequirementRegistry,
} from "./requirements.js";

const ctx: DataContext = { entity: "test_item", field: "requirements", sourceFile: "test.toml" };

function makeState(
  named: RequirementRegistry,
  extraPrimitives: string[] = [],
) {
  const primitives = new Set([
    "has_perk",
    "reached_skill_level",
    "reached_mines_level",
    "is_season",
    "unlocked_animal",
    "seen_cutscene",
    "reached_date",
    "has_upper_floor",
    "is_dating_someone",
    "scene_is_playing",
    "is_partner",
    "is_best_friend",
    "reached_heart_level",
    "met_npc",
    ...extraPrimitives,
  ]);
  return { named, primitives };
}

describe("parseRequirements", () => {
  it("resolves a primitive predicate", () => {
    const { named, primitives } = makeState({});
    const result = parseRequirements(
      { reached_skill_level: { ranching: 20 } },
      named,
      primitives,
      ctx,
    );
    expect(result).toEqual({ predicate: "reached_skill_level", value: { ranching: 20 } });
  });

  it("resolves a named requirement to its primitive", () => {
    const { named, primitives } = makeState({
      repaired_general_store: { seen_cutscene: "repair_the_general_store_pt_2" },
    });
    const result = parseRequirements(
      { repaired_general_store: true },
      named,
      primitives,
      ctx,
    );
    expect(result).toEqual({
      predicate: "seen_cutscene",
      value: "repair_the_general_store_pt_2",
    });
  });

  it("resolves nested named requirements", () => {
    const { named, primitives } = makeState({
      broke_bell: {
        invert: {
          or: [{ repaired_bell_tower: true }, { repaired_bell_tower_door: true }],
        },
        seen_cutscene: "repair_the_bell_tower_pt_1",
      },
      repaired_bell_tower: { seen_cutscene: "repair_the_bell_tower_pt_2" },
      repaired_bell_tower_door: { seen_cutscene: "repair_the_bell_tower_pt_2" },
    });

    const result = parseRequirements({ broke_bell: true }, named, primitives, ctx);

    expect(result).toHaveProperty("all");
    const all = (result as { all: RequirementExpr[] }).all;
    expect(all).toHaveLength(2);
    const predicateEntry = all.find((e) => "predicate" in e);
    const notEntry = all.find((e) => "not" in e);
    expect(predicateEntry).toEqual({ predicate: "seen_cutscene", value: "repair_the_bell_tower_pt_1" });
    expect(notEntry).toHaveProperty("not");
    const notExpr = (notEntry as { not: RequirementExpr }).not;
    expect(notExpr).toHaveProperty("any");
  });

  it("detects cycles", () => {
    const { named, primitives } = makeState({
      cycle_a: { cycle_b: true },
      cycle_b: { cycle_a: true },
    });
    expect(() =>
      parseRequirements({ cycle_a: true }, named, primitives, ctx),
    ).toThrow(/cycle_a -> cycle_b -> cycle_a/);
  });

  it("throws on unknown requirement names", () => {
    const { named, primitives } = makeState({});
    // unknown_requirement is neither primitive nor named
    const result = parseRequirements(
      { unknown_requirement: true },
      named,
      primitives,
      ctx,
    );
    // Unknown keys are treated as predicates (not errors) since we can't distinguish
    // all possible future predicate keys from typos at parse time
    expect(result).toEqual({ predicate: "unknown_requirement", value: true });
  });

  it("handles multiple sibling keys as implicit all", () => {
    const { named, primitives } = makeState({});
    const result = parseRequirements(
      { has_perk: "steady_supplies", is_season: "spring" },
      named,
      primitives,
      ctx,
    );
    expect(result).toEqual({
      all: [
        { predicate: "has_perk", value: "steady_supplies" },
        { predicate: "is_season", value: "spring" },
      ],
    });
  });

  it("handles or with array of alternatives", () => {
    const { named, primitives } = makeState({});
    const result = parseRequirements(
      { or: [{ is_season: "spring" }, { is_season: "summer" }] },
      named,
      primitives,
      ctx,
    );
    expect(result).toEqual({
      any: [
        { predicate: "is_season", value: "spring" },
        { predicate: "is_season", value: "summer" },
      ],
    });
  });

  it("resolves the real broke_bell definition from requirements.toml", () => {
    const { named, primitives } = makeState({
      broke_bell: {
        invert: {
          or: [{ repaired_bell_tower: true }, { repaired_bell_tower_door: true }],
        },
        seen_cutscene: "repair_the_bell_tower_pt_1",
      },
      repaired_bell_tower: { seen_cutscene: "repair_the_bell_tower_pt_2" },
      repaired_bell_tower_door: { seen_cutscene: "repair_the_bell_tower_pt_2" },
    });

    const result = parseRequirements({ broke_bell: true }, named, primitives, ctx);

    // Should be: all(seen_cutscene, not(any(seen_cutscene, seen_cutscene)))
    expect(result).toHaveProperty("all");
    const all = (result as { all: RequirementExpr[] }).all;
    expect(all).toHaveLength(2);
  });
});

describe("buildRequirementRegistry", () => {
  it("separates primitives from named requirements", () => {
    const data: Record<string, unknown> = {
      has_perk: {},
      is_season: {},
      repaired_general_store: { seen_cutscene: "repair_the_general_store_pt_2" },
      seen_cutscene: {},
    };
    const { named, primitives } = buildRequirementRegistry(data);
    expect(primitives.has("has_perk")).toBe(true);
    expect(primitives.has("is_season")).toBe(true);
    expect(primitives.has("seen_cutscene")).toBe(true);
    expect(primitives.has("repaired_general_store")).toBe(false);
    expect(named.repaired_general_store).toEqual({
      seen_cutscene: "repair_the_general_store_pt_2",
    });
  });

  it("parses the full requirements.toml fixture", () => {
    const parsed = parseFiddle("pipeline/input/assets");
    const requirementsData = parsed.data.requirements as Record<string, unknown>;
    expect(requirementsData).toBeDefined();

    const { named, primitives } = buildRequirementRegistry(requirementsData);
    expect(primitives.size).toBeGreaterThan(30);
    expect(Object.keys(named).length).toBeGreaterThan(20);

    // Verify repaired_general_store resolves
    const result = parseRequirements(
      { repaired_general_store: true },
      named,
      primitives,
      { entity: "test", field: "requirements", sourceFile: "stores.toml" },
    );
    expect(result).toEqual({
      predicate: "seen_cutscene",
      value: "repair_the_general_store_pt_2",
    });
  });
});
