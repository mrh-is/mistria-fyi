import { describe, expect, it } from "vitest";

import { simplifyCondition } from "../enrich/visibility-condition.js";
import { resolveToVisibility } from "./requirement-projector.js";

import type { CutsceneQuestMap } from "../extract/cutscene-quest-map.js";
import type { RequirementExpression } from "../parse/requirements.js";

const emptyCutsceneMap: CutsceneQuestMap = {};

describe("resolveToVisibility", () => {
  it("maps seen_cutscene via cutscene-quest map to questCompleted", () => {
    const cutsceneMap: CutsceneQuestMap = {
      repair_the_inn_pt_2: { phase: "completed", questId: "repair_the_inn" as never },
    };
    const expr: RequirementExpression = {
      predicate: "seen_cutscene",
      value: "repair_the_inn_pt_2",
    };
    expect(resolveToVisibility(expr, cutsceneMap)).toEqual({
      type: "questCompleted",
      questId: "repair_the_inn",
    });
  });

  it("maps seen_cutscene with quest_to_start to questAvailable", () => {
    const cutsceneMap: CutsceneQuestMap = {
      quest_start: { phase: "available", questId: "some_quest" as never },
    };
    const expr: RequirementExpression = {
      predicate: "seen_cutscene",
      value: "quest_start",
    };
    expect(resolveToVisibility(expr, cutsceneMap)).toEqual({
      type: "questAvailable",
      questId: "some_quest",
    });
  });

  it("maps reached_skill_level to skillLevel", () => {
    const expr: RequirementExpression = {
      predicate: "reached_skill_level",
      value: { farming: 30 },
    };
    expect(resolveToVisibility(expr, emptyCutsceneMap)).toEqual({
      type: "skillLevel",
      level: 30,
      skillId: "farming",
    });
  });

  it("maps reached_mines_level to mineFloor", () => {
    const expr: RequirementExpression = {
      predicate: "reached_mines_level",
      value: 41,
    };
    expect(resolveToVisibility(expr, emptyCutsceneMap)).toEqual({
      type: "mineFloor",
      floor: 41,
    });
  });

  it("maps completed_quest to questCompleted", () => {
    const expr: RequirementExpression = {
      predicate: "completed_quest",
      value: "repair_the_bridge",
    };
    expect(resolveToVisibility(expr, emptyCutsceneMap)).toEqual({
      type: "questCompleted",
      questId: "repair_the_bridge",
    });
  });

  it("maps met_villager to villagerKnown", () => {
    const expr: RequirementExpression = {
      predicate: "met_villager",
      value: "stillwell",
    };
    expect(resolveToVisibility(expr, emptyCutsceneMap)).toEqual({
      type: "villagerKnown",
      villagerId: "stillwell",
    });
  });

  it("projects is_season to always", () => {
    const expr: RequirementExpression = {
      predicate: "is_season",
      value: "spring",
    };
    expect(resolveToVisibility(expr, emptyCutsceneMap)).toEqual({ type: "always" });
  });

  it("projects is_day_type to always", () => {
    const expr: RequirementExpression = {
      predicate: "is_day_type",
      value: "saturday",
    };
    expect(resolveToVisibility(expr, emptyCutsceneMap)).toEqual({ type: "always" });
  });

  it("projects reached_date to always", () => {
    const expr: RequirementExpression = {
      predicate: "reached_date",
      value: { day: 1, season: "spring" },
    };
    expect(resolveToVisibility(expr, emptyCutsceneMap)).toEqual({ type: "always" });
  });

  it("projects acquired_item to always", () => {
    const expr: RequirementExpression = {
      predicate: "acquired_item",
      value: "copper_pickaxe",
    };
    expect(resolveToVisibility(expr, emptyCutsceneMap)).toEqual({ type: "always" });
  });

  it("projects invert (not) to always", () => {
    const expr: RequirementExpression = {
      not: { predicate: "seen_cutscene", value: "some_cutscene" },
    };
    expect(resolveToVisibility(expr, emptyCutsceneMap)).toEqual({ type: "always" });
  });

  it("resolves all (and) composition", () => {
    const cutsceneMap: CutsceneQuestMap = {
      repair_inn_pt_2: { phase: "completed", questId: "repair_the_inn" as never },
    };
    const expr: RequirementExpression = {
      all: [
        { predicate: "seen_cutscene", value: "repair_inn_pt_2" },
        { predicate: "reached_mines_level", value: 20 },
      ],
    };
    expect(resolveToVisibility(expr, cutsceneMap)).toEqual({
      type: "and",
      conditions: [
        { type: "questCompleted", questId: "repair_the_inn" },
        { type: "mineFloor", floor: 20 },
      ],
    });
  });

  it("resolves any (or) composition", () => {
    const expr: RequirementExpression = {
      any: [
        { predicate: "completed_quest", value: "quest_a" },
        { predicate: "completed_quest", value: "quest_b" },
      ],
    };
    expect(resolveToVisibility(expr, emptyCutsceneMap)).toEqual({
      type: "or",
      conditions: [
        { type: "questCompleted", questId: "quest_a" },
        { type: "questCompleted", questId: "quest_b" },
      ],
    });
  });

  it("maps reached_heart_level to heartLevel", () => {
    const expr: RequirementExpression = {
      predicate: "reached_heart_level",
      value: { ryis: 2 },
    };
    expect(resolveToVisibility(expr, emptyCutsceneMap)).toEqual({
      type: "heartLevel",
      level: 2,
      villagerId: "ryis",
    });
  });
});

describe("simplifyCondition", () => {
  it("drops always from and", () => {
    expect(
      simplifyCondition({
        type: "and",
        conditions: [{ type: "always" }, { type: "questCompleted", questId: "q" as never }],
      }),
    ).toEqual({ type: "questCompleted", questId: "q" });
  });

  it("collapses or containing always to always", () => {
    expect(
      simplifyCondition({
        type: "or",
        conditions: [{ type: "always" }, { type: "questCompleted", questId: "q" as never }],
      }),
    ).toEqual({ type: "always" });
  });

  it("collapses empty and to always", () => {
    expect(simplifyCondition({ type: "and", conditions: [] as never })).toEqual({ type: "always" });
  });

  it("unwraps single-element and", () => {
    expect(
      simplifyCondition({
        type: "and",
        conditions: [{ type: "questCompleted", questId: "q" as never }],
      }),
    ).toEqual({ type: "questCompleted", questId: "q" });
  });

  it("simplifies nested and-of-or with always", () => {
    expect(
      simplifyCondition({
        type: "and",
        conditions: [
          {
            type: "or",
            conditions: [{ type: "always" }, { type: "questCompleted", questId: "q" as never }],
          },
          { type: "mineFloor", floor: 20 },
        ],
      }),
    ).toEqual({ type: "mineFloor", floor: 20 });
  });
});
